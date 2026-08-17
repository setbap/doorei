import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { isMainThread } from "node:worker_threads"
import { InferenceSession, Tensor } from "onnxruntime-node"
import type { CaptionSegment } from "../library/index.js"

export const SHENAVA_BLANK_ID = 1024
export const SHENAVA_MS_PER_STEP = 80
export const SHENAVA_SAMPLE_RATE = 16000
export const SHENAVA_HOP_LENGTH = 160
export const SHENAVA_FIXED_FRAMES = 2005
export const SHENAVA_WINDOW_SAMPLES = (SHENAVA_FIXED_FRAMES - 1) * SHENAVA_HOP_LENGTH
export const SHENAVA_OUTPUT_STRIDE = 8
export const SHENAVA_OVERLAP_SAMPLES = 2 * SHENAVA_SAMPLE_RATE
export const SHENAVA_HOP_SAMPLES = SHENAVA_WINDOW_SAMPLES - SHENAVA_OVERLAP_SAMPLES

const PAUSE_STEPS = 12
const MAX_CUE_WORDS = 24
const MAX_CUE_MS = 12000
const N_FFT = 512
const WIN_LENGTH = 400
const CENTER_PAD = 256
const N_MELS = 80
const N_FREQ = N_FFT / 2 + 1
const PREEMPHASIS = 0.97
const LOG_GUARD = 5.960464477539063e-8
const WINDOW_OFFSET = (N_FFT - WIN_LENGTH) / 2

export type ShenavaGraph = {
  infer(mel: Float32Array, frameCount: number): Promise<number[]>
}

const HANN = hann(WIN_LENGTH)

export function decodeShenavaCtc(
  stepIds: number[],
  tokens: string[],
  windowStartSeconds: number
): CaptionSegment[] {
  const pieces: { text: string; startStep: number; endStep: number }[] = []
  let step = 0
  while (step < stepIds.length) {
    const id = stepIds[step] ?? SHENAVA_BLANK_ID
    const startStep = step
    while (step + 1 < stepIds.length && stepIds[step + 1] === id) step += 1
    const endStep = step
    step += 1
    if (id === SHENAVA_BLANK_ID) continue
    const token = tokens[id] ?? ""
    if (token.startsWith("<") && token.endsWith(">")) continue
    const word = token.startsWith("▁") ? token.slice(1) : token
    const last = pieces.at(-1)
    if (token.startsWith("▁") || !last) {
      if (word) pieces.push({ text: word, startStep, endStep })
    } else {
      last.text += word
      last.endStep = endStep
    }
  }
  const startMs = Math.round(windowStartSeconds * 1000)
  return groupCueWords(pieces).map((cue) => ({
    startSeconds: (startMs + cue.startStep * SHENAVA_MS_PER_STEP) / 1000,
    endSeconds: (startMs + (cue.endStep + 1) * SHENAVA_MS_PER_STEP) / 1000,
    text: cue.text
  }))
}

function groupCueWords(
  words: { text: string; startStep: number; endStep: number }[]
): { text: string; startStep: number; endStep: number }[] {
  if (words.length === 0) return []
  const cues: { text: string; startStep: number; endStep: number }[] = []
  let group = [words[0]!]
  const emit = () => {
    const first = group[0]
    const last = group.at(-1)
    if (!first || !last) return
    cues.push({
      text: group.map((word) => word.text).join(" "),
      startStep: first.startStep,
      endStep: last.endStep
    })
    group = []
  }
  for (const word of words.slice(1)) {
    const prev = group.at(-1)!
    const first = group[0]!
    const gap = word.startStep - prev.endStep
    const durationMs = (word.endStep - first.startStep) * SHENAVA_MS_PER_STEP
    if (gap >= PAUSE_STEPS || group.length >= MAX_CUE_WORDS || durationMs >= MAX_CUE_MS) {
      emit()
    }
    group.push(word)
  }
  emit()
  return cues
}

export function argmaxLogits(logits: Float32Array, steps: number, vocab: number): number[] {
  const ids = Array<number>(steps)
  for (let step = 0; step < steps; step += 1) {
    let best = 0
    let bestValue = -Infinity
    const row = step * vocab
    for (let id = 0; id < vocab; id += 1) {
      const value = logits[row + id] ?? -Infinity
      if (value > bestValue) {
        bestValue = value
        best = id
      }
    }
    ids[step] = best
  }
  return ids
}

export function loadShenavaSidecars(modelDir: string): { tokens: string[]; filters: number[][] } {
  const tokenFile = JSON.parse(readFileSync(join(modelDir, "tokens.json"), "utf8")) as {
    tokens?: string[]
  }
  const tokens = tokenFile.tokens
  if (!tokens?.length) throw new Error("Shenava tokens.json is missing a tokens list")
  const preprocessor = JSON.parse(readFileSync(join(modelDir, "preprocessor.json"), "utf8")) as {
    hop_length?: number
    fixed_frames?: number
    blank_id?: number
    n_mels?: number
  }
  if (
    preprocessor.hop_length !== SHENAVA_HOP_LENGTH ||
    preprocessor.fixed_frames !== SHENAVA_FIXED_FRAMES ||
    preprocessor.blank_id !== SHENAVA_BLANK_ID ||
    preprocessor.n_mels !== N_MELS
  ) {
    throw new Error("Shenava preprocessor.json does not match the Captioning pipeline")
  }
  const filters = JSON.parse(
    readFileSync(join(modelDir, "mel_filters_slaney_80x257.json"), "utf8")
  ) as number[][]
  if (filters.length !== N_MELS) throw new Error("Shenava mel filters must be 80 x 257")
  return { tokens, filters }
}

export async function createOnnxShenavaGraph(modelDir: string): Promise<ShenavaGraph> {
  const onnxPath = shenavaOnnxPath(modelDir)
  const session = await createShenavaSession(onnxPath)
  const signalName = session.inputNames[0] ?? "processed_signal"
  const lengthName = session.inputNames[1] ?? "processed_signal_length"
  const logitsName = session.outputNames[0] ?? "logits"
  const lengthsName = session.outputNames[1] ?? "encoded_lengths"
  return {
    async infer(mel, frameCount) {
      const results = await session.run({
        [signalName]: nativeFloat16Tensor(mel, [1, N_MELS, SHENAVA_FIXED_FRAMES]),
        [lengthName]: new Tensor("int64", BigInt64Array.from([BigInt(frameCount)]), [1])
      })
      const logitsTensor = results[logitsName]
      const lengthsTensor = results[lengthsName]
      if (!logitsTensor) throw new Error("Shenava ONNX produced no logits")
      const dims = logitsTensor.dims
      const steps = dims.length >= 2 ? Number(dims[dims.length - 2]) : 0
      const vocab = dims.length >= 1 ? Number(dims[dims.length - 1]) : 0
      const encoded =
        lengthsTensor && lengthsTensor.data.length > 0 ? Number(lengthsTensor.data[0]) : steps
      const usable = Math.max(0, Math.min(steps, encoded))
      return argmaxLogits(tensorToFloat32(logitsTensor), usable, vocab)
    }
  }
}

function shenavaOnnxPath(modelDir: string): string {
  const match = readdirSync(modelDir).find((name) => name.endsWith("_embedded.onnx"))
  if (!match || !existsSync(join(modelDir, match))) {
    throw new Error("Shenava ONNX file is not on disk")
  }
  return join(modelDir, match)
}

async function createShenavaSession(onnxPath: string): Promise<InferenceSession> {
  // CoreML inside a Worker thread is a known source of native
  // `bad_array_new_length` aborts on macOS.
  if (process.platform === "darwin" && isMainThread) {
    try {
      return await InferenceSession.create(onnxPath, { executionProviders: ["coreml", "cpu"] })
    } catch {
      /* CoreML EP missing or rejected this graph */
    }
  }
  return InferenceSession.create(onnxPath, { executionProviders: ["cpu"] })
}

export function nativeFloat16Tensor(values: Float32Array, dims: number[]): Tensor {
  // onnxruntime-node copies float16 via NAPI typed-array type 4 (Uint16Array).
  // Node 24's Tensor wraps those bits in Float16Array, and the native addon then
  // copies 0 bytes ("not enough space: expected N, got 0"). Node 22 has no
  // Float16Array, so pack IEEE-754 half bits ourselves and always expose Uint16Array.
  const bits = float32ToFloat16(values)
  const tensor = new Tensor("float16", bits, dims)
  const view = tensor.data as ArrayBufferView
  Object.defineProperty(tensor, "cpuData", {
    value: new Uint16Array(view.buffer, view.byteOffset, view.byteLength / Uint16Array.BYTES_PER_ELEMENT),
    configurable: true
  })
  return tensor
}

function float32ToFloat16(src: Float32Array): Uint16Array {
  const out = new Uint16Array(src.length)
  for (let i = 0; i < src.length; i += 1) out[i] = floatToHalf(src[i] ?? 0)
  return out
}

function floatToHalf(value: number): number {
  const floatView = new Float32Array(1)
  const int32View = new Int32Array(floatView.buffer)
  floatView[0] = value
  const x = int32View[0] ?? 0
  const sign = (x >>> 16) & 0x8000
  const exponent = (x >>> 23) & 0xff
  const mantissa = x & 0x7fffff
  if (exponent === 255) return sign | 0x7c00 | (mantissa ? 0x200 : 0)
  const exp = exponent - 127 + 15
  if (exp >= 31) return sign | 0x7c00
  if (exp <= 0) {
    if (exp < -10) return sign
    const frac = (mantissa | 0x800000) >> (1 - exp)
    return sign | ((frac + 0x1000) >> 13)
  }
  return sign | (exp << 10) | ((mantissa + 0x1000) >> 13)
}

function tensorToFloat32(tensor: Tensor): Float32Array {
  const data = tensor.data
  if (tensor.type === "float32" || (ArrayBuffer.isView(data) && !(data instanceof Uint16Array))) {
    return Float32Array.from(data as ArrayLike<number>)
  }
  const bits = data as Uint16Array
  const out = new Float32Array(bits.length)
  for (let i = 0; i < bits.length; i += 1) out[i] = halfToFloat(bits[i] ?? 0)
  return out
}

function halfToFloat(half: number): number {
  const sign = (half & 0x8000) >> 15
  const exponent = (half & 0x7c00) >> 10
  const fraction = half & 0x03ff
  if (exponent === 0) return (sign ? -1 : 1) * 2 ** -14 * (fraction / 1024)
  if (exponent === 31) return fraction ? NaN : sign ? -Infinity : Infinity
  return (sign ? -1 : 1) * 2 ** (exponent - 15) * (1 + fraction / 1024)
}

export type PcmWindow = {
  pcm: Float32Array
  offset: number
  isFirst: boolean
  isLast: boolean
}

export class PcmWindowAssembler {
  private buffer = Buffer.alloc(0)
  private offset = 0
  private index = 0

  push(chunk: Buffer): PcmWindow[] {
    this.buffer = Buffer.concat([this.buffer, chunk])
    const windows: PcmWindow[] = []
    const windowBytes = SHENAVA_WINDOW_SAMPLES * 4
    const hopBytes = SHENAVA_HOP_SAMPLES * 4
    while (this.buffer.length >= windowBytes) {
      const copy = Buffer.from(this.buffer.subarray(0, windowBytes))
      windows.push({
        pcm: new Float32Array(copy.buffer, copy.byteOffset, SHENAVA_WINDOW_SAMPLES),
        offset: this.offset,
        isFirst: this.index === 0,
        isLast: false
      })
      this.buffer = Buffer.from(this.buffer.subarray(hopBytes))
      this.offset += SHENAVA_HOP_SAMPLES
      this.index += 1
    }
    return windows
  }

  flush(): PcmWindow | null {
    const samples = Math.floor(this.buffer.length / 4)
    if (samples === 0) return null
    if (this.index > 0 && samples <= SHENAVA_OVERLAP_SAMPLES) return null
    const copy = Buffer.from(this.buffer.subarray(0, samples * 4))
    return {
      pcm: new Float32Array(copy.buffer, copy.byteOffset, samples),
      offset: this.offset,
      isFirst: this.index === 0,
      isLast: true
    }
  }
}

export function keepWindowCues(
  cues: CaptionSegment[],
  window: { windowStartSeconds: number; windowSeconds: number; isFirst: boolean; isLast: boolean }
): CaptionSegment[] {
  const overlapSeconds = SHENAVA_OVERLAP_SAMPLES / SHENAVA_SAMPLE_RATE
  const keepAfter = window.isFirst ? 0 : overlapSeconds / 2
  const keepBefore = window.isLast ? window.windowSeconds : window.windowSeconds - overlapSeconds / 2
  return cues.filter((cue) => {
    const mid = (cue.startSeconds + cue.endSeconds) / 2 - window.windowStartSeconds
    return mid >= keepAfter && mid < keepBefore
  })
}

export async function captionShenavaWindow(
  pcm: Float32Array,
  model: { graph: ShenavaGraph; tokens: string[]; filters: number[][] },
  window: { windowStartSeconds: number; isFirst: boolean; isLast: boolean }
): Promise<CaptionSegment[]> {
  if (pcm.length === 0) return []
  const windowSeconds = pcm.length / SHENAVA_SAMPLE_RATE
  const ids = await model.graph.infer(logMel(fullWindowPcm(pcm), model.filters), frameCountFor(pcm.length))
  const usable = Math.min(ids.length, Math.ceil(frameCountFor(pcm.length) / SHENAVA_OUTPUT_STRIDE))
  const decoded = decodeShenavaCtc(ids.slice(0, usable), model.tokens, window.windowStartSeconds)
  return keepWindowCues(decoded, {
    windowStartSeconds: window.windowStartSeconds,
    windowSeconds,
    isFirst: window.isFirst,
    isLast: window.isLast
  })
}

function fullWindowPcm(pcm: Float32Array): Float32Array {
  if (pcm.length >= SHENAVA_WINDOW_SAMPLES) return pcm.subarray(0, SHENAVA_WINDOW_SAMPLES)
  const padded = new Float32Array(SHENAVA_WINDOW_SAMPLES)
  padded.set(pcm)
  return padded
}

export async function runShenavaPcm(
  pcm: Float32Array,
  model: { graph: ShenavaGraph; tokens: string[]; filters: number[][] },
  onSegment: (segment: CaptionSegment) => void | Promise<void>,
  onProgress?: (progress: number) => void | Promise<void>
): Promise<void> {
  if (pcm.length === 0) return
  let index = 0
  for (let offset = 0; offset < pcm.length; offset += SHENAVA_HOP_SAMPLES) {
    const end = Math.min(offset + SHENAVA_WINDOW_SAMPLES, pcm.length)
    const slice = pcm.subarray(offset, end)
    const isLast = end >= pcm.length
    const segments = await captionShenavaWindow(slice, model, {
      windowStartSeconds: offset / SHENAVA_SAMPLE_RATE,
      isFirst: index === 0,
      isLast
    })
    for (const segment of segments) await onSegment(segment)
    await onProgress?.(end / pcm.length)
    index += 1
    if (isLast) break
  }
}

function frameCountFor(samples: number): number {
  return Math.max(1, Math.min(SHENAVA_FIXED_FRAMES, Math.floor(samples / SHENAVA_HOP_LENGTH) + 1))
}

function logMel(pcm: Float32Array, filters: number[][]): Float32Array {
  const emphasized = new Float32Array(pcm.length)
  if (pcm.length > 0) emphasized[0] = pcm[0] ?? 0
  for (let i = 1; i < pcm.length; i += 1) {
    emphasized[i] = (pcm[i] ?? 0) - PREEMPHASIS * (pcm[i - 1] ?? 0)
  }
  const padded = reflectPad(emphasized, CENTER_PAD)
  const frameCount = frameCountFor(pcm.length)
  const power = new Float64Array(N_FREQ)
  const real = new Float64Array(N_FFT)
  const imag = new Float64Array(N_FFT)
  const mel = new Float32Array(N_MELS * SHENAVA_FIXED_FRAMES)
  for (let frame = 0; frame < frameCount; frame += 1) {
    real.fill(0)
    imag.fill(0)
    const start = frame * SHENAVA_HOP_LENGTH
    for (let i = 0; i < WIN_LENGTH; i += 1) {
      real[WINDOW_OFFSET + i] = (padded[start + WINDOW_OFFSET + i] ?? 0) * (HANN[i] ?? 0)
    }
    fftRadix2(real, imag)
    for (let k = 0; k < N_FREQ; k += 1) {
      const re = real[k] ?? 0
      const im = imag[k] ?? 0
      power[k] = re * re + im * im
    }
    for (let m = 0; m < N_MELS; m += 1) {
      const row = filters[m]
      let sum = 0
      if (row) {
        for (let k = 0; k < N_FREQ; k += 1) sum += (row[k] ?? 0) * (power[k] ?? 0)
      }
      mel[m * SHENAVA_FIXED_FRAMES + frame] = Math.log(sum + LOG_GUARD)
    }
  }
  return mel
}

function reflectPad(pcm: Float32Array, pad: number): Float32Array {
  const out = new Float32Array(pcm.length + pad * 2)
  for (let i = 0; i < pcm.length; i += 1) out[pad + i] = pcm[i] ?? 0
  for (let i = 0; i < pad; i += 1) {
    const src = Math.min(pcm.length - 1, i + 1)
    out[pad - 1 - i] = pcm[src] ?? 0
    out[pad + pcm.length + i] = pcm[Math.max(0, pcm.length - 2 - i)] ?? 0
  }
  return out
}

function hann(length: number): Float64Array {
  const window = new Float64Array(length)
  for (let i = 0; i < length; i += 1) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (length - 1))
  }
  return window
}

function fftRadix2(real: Float64Array, imag: Float64Array): void {
  const n = real.length
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const re = real[i] ?? 0
      const im = imag[i] ?? 0
      real[i] = real[j] ?? 0
      imag[i] = imag[j] ?? 0
      real[j] = re
      imag[j] = im
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1
    const ang = (-2 * Math.PI) / size
    const wRe0 = Math.cos(ang)
    const wIm0 = Math.sin(ang)
    for (let i = 0; i < n; i += size) {
      let wRe = 1
      let wIm = 0
      for (let j = 0; j < half; j += 1) {
        const even = i + j
        const odd = even + half
        const oRe = real[odd] ?? 0
        const oIm = imag[odd] ?? 0
        const tRe = oRe * wRe - oIm * wIm
        const tIm = oRe * wIm + oIm * wRe
        const eRe = real[even] ?? 0
        const eIm = imag[even] ?? 0
        real[even] = eRe + tRe
        imag[even] = eIm + tIm
        real[odd] = eRe - tRe
        imag[odd] = eIm - tIm
        const nextRe = wRe * wRe0 - wIm * wIm0
        wIm = wRe * wIm0 + wIm * wRe0
        wRe = nextRe
      }
    }
  }
}
