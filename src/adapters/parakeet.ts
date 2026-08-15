import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { InferenceSession, Tensor } from "onnxruntime-node"
import type { CaptionSegment } from "../library/index.js"

export const PARAKEET_MS_PER_FRAME = 80
export const PARAKEET_MAX_TOKENS_PER_STEP = 10
export const PARAKEET_SAMPLE_RATE = 16000
export const PARAKEET_WINDOW_SAMPLES = 20 * PARAKEET_SAMPLE_RATE
export const PARAKEET_OVERLAP_SAMPLES = 2 * PARAKEET_SAMPLE_RATE
export const PARAKEET_HOP_SAMPLES = PARAKEET_WINDOW_SAMPLES - PARAKEET_OVERLAP_SAMPLES

const PAUSE_MS = 480
const MAX_CUE_WORDS = 12
const MAX_CUE_MS = 6000
const N_FFT = 512
const WIN_LENGTH = 400
const HOP_LENGTH = 160
const CENTER_PAD = N_FFT / 2
const N_MELS = 128
const N_FREQ = N_FFT / 2 + 1
const PREEMPHASIS = 0.97
const LOG_GUARD = 2 ** -24
const ENCODER_DIM = 1024
const LSTM_LAYERS = 2
const LSTM_HIDDEN = 640
const DURATION_BINS = 5

const HANN = hann(WIN_LENGTH)
const MEL_FILTERS = slaneyMelFilters(N_MELS)

export type ParakeetJoin = (
  frameIndex: number,
  prevToken: number
) => { tokenId: number; duration: number } | Promise<{ tokenId: number; duration: number }>

export type ParakeetGraph = {
  encode(pcm: Float32Array): Promise<{ frameCount: number }>
  join(frameIndex: number, prevToken: number): Promise<{ tokenId: number; duration: number }>
}

export type PcmWindow = {
  pcm: Float32Array
  offset: number
  isFirst: boolean
  isLast: boolean
}

export async function decodeParakeetTdt(
  frameCount: number,
  join: ParakeetJoin,
  tokens: string[],
  blankId: number,
  windowStartSeconds: number
): Promise<CaptionSegment[]> {
  const pieces: { text: string; startMs: number; endMs: number }[] = []
  const startMs = Math.round(windowStartSeconds * 1000)
  let prevToken = blankId
  let emitted = 0
  for (let frame = 0; frame < frameCount; ) {
    const { tokenId, duration } = await join(frame, prevToken)
    if (tokenId !== blankId) {
      prevToken = tokenId
      emitted += 1
      const token = tokens[tokenId] ?? ""
      if (!(token.startsWith("<") && token.endsWith(">"))) {
        const word = token.startsWith("▁") ? token.slice(1) : token
        const durFrames = duration > 0 ? duration : 1
        const tokenStart = startMs + frame * PARAKEET_MS_PER_FRAME
        const tokenEnd =
          startMs + Math.min(frameCount, frame + Math.max(1, durFrames)) * PARAKEET_MS_PER_FRAME
        const last = pieces.at(-1)
        if (token.startsWith("▁") || !last) {
          if (word) pieces.push({ text: word, startMs: tokenStart, endMs: tokenEnd })
        } else {
          last.text += word
          last.endMs = tokenEnd
        }
      }
    }
    if (duration > 0) {
      frame += duration
      emitted = 0
    } else if (tokenId === blankId || emitted >= PARAKEET_MAX_TOKENS_PER_STEP) {
      frame += 1
      emitted = 0
    }
  }
  return groupCueWords(pieces)
}

function groupCueWords(
  words: { text: string; startMs: number; endMs: number }[]
): CaptionSegment[] {
  if (words.length === 0) return []
  const cues: CaptionSegment[] = []
  let group = [words[0]!]
  const emit = () => {
    const first = group[0]
    const last = group.at(-1)
    if (!first || !last) return
    cues.push({
      startSeconds: first.startMs / 1000,
      endSeconds: last.endMs / 1000,
      text: group.map((word) => word.text).join(" ")
    })
    group = []
  }
  for (const word of words.slice(1)) {
    const prev = group.at(-1)!
    const first = group[0]!
    const gap = word.startMs - prev.endMs
    const durationMs = word.endMs - first.startMs
    if (gap >= PAUSE_MS || group.length >= MAX_CUE_WORDS || durationMs >= MAX_CUE_MS) emit()
    group.push(word)
  }
  emit()
  return cues
}

export function keepWindowCues(
  cues: CaptionSegment[],
  window: { windowStartSeconds: number; windowSeconds: number; isFirst: boolean; isLast: boolean }
): CaptionSegment[] {
  const overlapSeconds = PARAKEET_OVERLAP_SAMPLES / PARAKEET_SAMPLE_RATE
  const keepAfter = window.isFirst ? 0 : overlapSeconds / 2
  const keepBefore = window.isLast ? window.windowSeconds : window.windowSeconds - overlapSeconds / 2
  return cues.filter((cue) => {
    const mid = (cue.startSeconds + cue.endSeconds) / 2 - window.windowStartSeconds
    return mid >= keepAfter && mid < keepBefore
  })
}

export async function captionParakeetWindow(
  pcm: Float32Array,
  model: { graph: ParakeetGraph; tokens: string[]; blankId: number },
  window: { windowStartSeconds: number; isFirst: boolean; isLast: boolean }
): Promise<CaptionSegment[]> {
  const encoded = await model.graph.encode(pcm)
  const decoded = await decodeParakeetTdt(
    encoded.frameCount,
    (frame, prevToken) => model.graph.join(frame, prevToken),
    model.tokens,
    model.blankId,
    window.windowStartSeconds
  )
  return keepWindowCues(decoded, {
    windowStartSeconds: window.windowStartSeconds,
    windowSeconds: pcm.length / PARAKEET_SAMPLE_RATE,
    isFirst: window.isFirst,
    isLast: window.isLast
  })
}

export async function runParakeetPcm(
  pcm: Float32Array,
  model: { graph: ParakeetGraph; tokens: string[]; blankId: number },
  onSegment: (segment: CaptionSegment) => void | Promise<void>,
  onProgress?: (progress: number) => void | Promise<void>
): Promise<void> {
  if (pcm.length === 0) return
  let index = 0
  for (let offset = 0; offset < pcm.length; offset += PARAKEET_HOP_SAMPLES) {
    const end = Math.min(offset + PARAKEET_WINDOW_SAMPLES, pcm.length)
    const slice = pcm.subarray(offset, end)
    const isLast = end >= pcm.length
    const segments = await captionParakeetWindow(slice, model, {
      windowStartSeconds: offset / PARAKEET_SAMPLE_RATE,
      isFirst: index === 0,
      isLast
    })
    for (const segment of segments) await onSegment(segment)
    await onProgress?.(end / pcm.length)
    index += 1
    if (isLast) break
  }
}

export class PcmWindowAssembler {
  private buffer = Buffer.alloc(0)
  private offset = 0
  private index = 0

  push(chunk: Buffer): PcmWindow[] {
    this.buffer = Buffer.concat([this.buffer, chunk])
    const windows: PcmWindow[] = []
    const windowBytes = PARAKEET_WINDOW_SAMPLES * 4
    const hopBytes = PARAKEET_HOP_SAMPLES * 4
    while (this.buffer.length >= windowBytes) {
      const copy = Buffer.from(this.buffer.subarray(0, windowBytes))
      windows.push({
        pcm: new Float32Array(copy.buffer, copy.byteOffset, PARAKEET_WINDOW_SAMPLES),
        offset: this.offset,
        isFirst: this.index === 0,
        isLast: false
      })
      this.buffer = Buffer.from(this.buffer.subarray(hopBytes))
      this.offset += PARAKEET_HOP_SAMPLES
      this.index += 1
    }
    return windows
  }

  flush(): PcmWindow | null {
    const samples = Math.floor(this.buffer.length / 4)
    if (samples === 0) return null
    if (this.index > 0 && samples <= PARAKEET_OVERLAP_SAMPLES) return null
    const copy = Buffer.from(this.buffer.subarray(0, samples * 4))
    return {
      pcm: new Float32Array(copy.buffer, copy.byteOffset, samples),
      offset: this.offset,
      isFirst: this.index === 0,
      isLast: true
    }
  }
}

export function loadParakeetVocab(modelDir: string): { tokens: string[]; blankId: number } {
  const text = readFileSync(join(modelDir, "vocab.txt"), "utf8")
  const tokens: string[] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue
    const split = line.lastIndexOf(" ")
    if (split <= 0) continue
    const id = Number(line.slice(split + 1))
    if (!Number.isInteger(id) || id < 0) continue
    tokens[id] = line.slice(0, split)
  }
  const blankId = tokens.findIndex((token) => token === "<blk>" || token === " ")
  return { tokens, blankId: blankId >= 0 ? blankId : Math.max(0, tokens.length - 1) }
}

export async function createOnnxParakeetGraph(
  modelDir: string,
  blankId = loadParakeetVocab(modelDir).blankId
): Promise<ParakeetGraph> {
  const encoderPath = firstExisting(modelDir, ["encoder-model.int8.onnx"])
  const decoderPath = firstExisting(modelDir, ["decoder_joint-model.int8.onnx"])
  if (!encoderPath || !decoderPath) {
    throw new Error("Parakeet encoder or decoder ONNX is missing")
  }
  const encoder = await InferenceSession.create(encoderPath)
  const decoder = await InferenceSession.create(decoderPath)
  let encoded: Float32Array | null = null
  let frameCount = 0
  let state1 = new Float32Array(LSTM_LAYERS * LSTM_HIDDEN)
  let state2 = new Float32Array(LSTM_LAYERS * LSTM_HIDDEN)

  return {
    async encode(pcm) {
      const mel = logMel128(pcm)
      const melFrames = mel.length / N_MELS
      const result = await encoder.run({
        audio_signal: new Tensor("float32", mel, [1, N_MELS, melFrames]),
        length: new Tensor("int64", BigInt64Array.from([BigInt(melFrames)]), [1])
      })
      const outputs = result.outputs
      if (!outputs) throw new Error("Parakeet encoder did not return outputs")
      encoded = outputs.data as Float32Array
      frameCount = outputs.dims[2] ?? 0
      state1 = new Float32Array(LSTM_LAYERS * LSTM_HIDDEN)
      state2 = new Float32Array(LSTM_LAYERS * LSTM_HIDDEN)
      return { frameCount }
    },
    async join(frameIndex, prevToken) {
      if (!encoded) throw new Error("Parakeet encoder has not run")
      const frame = new Float32Array(ENCODER_DIM)
      for (let dim = 0; dim < ENCODER_DIM; dim += 1) {
        frame[dim] = encoded[dim * frameCount + frameIndex] ?? 0
      }
      const result = await decoder.run({
        encoder_outputs: new Tensor("float32", frame, [1, ENCODER_DIM, 1]),
        targets: new Tensor("int32", new Int32Array([prevToken]), [1, 1]),
        target_length: new Tensor("int32", new Int32Array([1]), [1]),
        input_states_1: new Tensor("float32", state1, [LSTM_LAYERS, 1, LSTM_HIDDEN]),
        input_states_2: new Tensor("float32", state2, [LSTM_LAYERS, 1, LSTM_HIDDEN])
      })
      const logits = result.outputs?.data as Float32Array | undefined
      if (!logits) throw new Error("Parakeet decoder did not return outputs")
      const vocab = logits.length - DURATION_BINS
      let tokenId = 0
      let tokenBest = -Infinity
      for (let id = 0; id < vocab; id += 1) {
        const value = logits[id] ?? -Infinity
        if (value > tokenBest) {
          tokenBest = value
          tokenId = id
        }
      }
      let duration = 0
      let durationBest = -Infinity
      for (let step = 0; step < DURATION_BINS; step += 1) {
        const value = logits[vocab + step] ?? -Infinity
        if (value > durationBest) {
          durationBest = value
          duration = step
        }
      }
      if (tokenId !== blankId) {
        state1 = new Float32Array(result.output_states_1?.data as Float32Array)
        state2 = new Float32Array(result.output_states_2?.data as Float32Array)
      }
      return { tokenId, duration }
    }
  }
}

function firstExisting(dir: string, names: string[]): string | null {
  const files = readdirSync(dir)
  for (const name of names) {
    if (files.includes(name)) return join(dir, name)
  }
  return existsSync(join(dir, names[0] ?? "")) ? join(dir, names[0] ?? "") : null
}

function logMel128(pcm: Float32Array): Float32Array {
  const emphasized = new Float32Array(pcm.length)
  if (pcm.length > 0) emphasized[0] = pcm[0] ?? 0
  for (let i = 1; i < pcm.length; i += 1) {
    emphasized[i] = (pcm[i] ?? 0) - PREEMPHASIS * (pcm[i - 1] ?? 0)
  }
  const padded = reflectPad(emphasized, CENTER_PAD)
  const frameCount = Math.max(1, Math.floor(pcm.length / HOP_LENGTH) + 1)
  const power = new Float64Array(N_FREQ)
  const real = new Float64Array(N_FFT)
  const imag = new Float64Array(N_FFT)
  const raw = new Float32Array(N_MELS * frameCount)
  for (let frame = 0; frame < frameCount; frame += 1) {
    real.fill(0)
    imag.fill(0)
    const start = frame * HOP_LENGTH
    for (let i = 0; i < N_FFT; i += 1) {
      const sample = padded[start + i] ?? 0
      const window = i >= (N_FFT - WIN_LENGTH) / 2 && i < (N_FFT + WIN_LENGTH) / 2
        ? (HANN[i - (N_FFT - WIN_LENGTH) / 2] ?? 0)
        : 0
      real[i] = sample * window
    }
    fftRadix2(real, imag)
    for (let k = 0; k < N_FREQ; k += 1) {
      const re = real[k] ?? 0
      const im = imag[k] ?? 0
      power[k] = re * re + im * im
    }
    for (let m = 0; m < N_MELS; m += 1) {
      const row = m * N_FREQ
      let sum = 0
      for (let k = 0; k < N_FREQ; k += 1) sum += (MEL_FILTERS[row + k] ?? 0) * (power[k] ?? 0)
      raw[m * frameCount + frame] = Math.log(sum + LOG_GUARD)
    }
  }
  return cmvn(raw, N_MELS, frameCount)
}

function cmvn(raw: Float32Array, nMels: number, frameCount: number): Float32Array {
  const out = new Float32Array(raw.length)
  const denom = Math.max(1, frameCount - 1)
  for (let m = 0; m < nMels; m += 1) {
    const row = m * frameCount
    let sum = 0
    for (let t = 0; t < frameCount; t += 1) sum += raw[row + t] ?? 0
    const mean = sum / frameCount
    let varSum = 0
    for (let t = 0; t < frameCount; t += 1) {
      const delta = (raw[row + t] ?? 0) - mean
      varSum += delta * delta
    }
    const invStd = 1 / Math.sqrt(varSum / denom + 1e-5)
    for (let t = 0; t < frameCount; t += 1) {
      out[row + t] = ((raw[row + t] ?? 0) - mean) * invStd
    }
  }
  return out
}

function slaneyMelFilters(nMels: number): Float32Array {
  const fMin = 0
  const fMax = PARAKEET_SAMPLE_RATE / 2
  const fSp = 200 / 3
  const minLogHz = 1000
  const minLogMel = minLogHz / fSp
  const logStep = Math.log(6.4) / 27
  const hzToMel = (freq: number) =>
    freq >= minLogHz ? minLogMel + Math.log(freq / minLogHz) / logStep : freq / fSp
  const melToHz = (mel: number) =>
    mel >= minLogMel ? minLogHz * Math.exp(logStep * (mel - minLogMel)) : mel * fSp
  const allFreqs = Array.from({ length: N_FREQ }, (_, k) => (fMax * k) / (N_FREQ - 1))
  const nPoints = nMels + 2
  const fPts = Array.from({ length: nPoints }, (_, i) =>
    melToHz(hzToMel(fMin) + ((hzToMel(fMax) - hzToMel(fMin)) * i) / (nPoints - 1))
  )
  const fb = new Float32Array(nMels * N_FREQ)
  for (let m = 0; m < nMels; m += 1) {
    const left = fPts[m] ?? 0
    const center = fPts[m + 1] ?? 0
    const right = fPts[m + 2] ?? 0
    const down = center - left
    const up = right - center
    const enorm = 2 / (right - left)
    const row = m * N_FREQ
    for (let k = 0; k < N_FREQ; k += 1) {
      const freq = allFreqs[k] ?? 0
      const downSlope = down === 0 ? 0 : (freq - left) / down
      const upSlope = up === 0 ? 0 : (right - freq) / up
      fb[row + k] = Math.max(0, Math.min(downSlope, upSlope)) * enorm
    }
  }
  return fb
}

function reflectPad(pcm: Float32Array, pad: number): Float32Array {
  const out = new Float32Array(pcm.length + pad * 2)
  for (let i = 0; i < pcm.length; i += 1) out[pad + i] = pcm[i] ?? 0
  for (let i = 0; i < pad; i += 1) {
    out[pad - 1 - i] = pcm[Math.min(pcm.length - 1, i + 1)] ?? 0
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
