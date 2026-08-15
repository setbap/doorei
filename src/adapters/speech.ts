import { execFile, spawn } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { dirname, join, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { Worker } from "node:worker_threads"
import { promisify } from "node:util"
import { REQUIRED_MODELS, type CaptionSegment, type SpeechRecognizer } from "../library/index.js"
import { modelDir } from "./modelStore.js"
import {
  PcmWindowAssembler,
  SHENAVA_SAMPLE_RATE,
  captionShenavaWindow,
  createOnnxShenavaGraph,
  loadShenavaSidecars,
  type PcmWindow,
  type ShenavaGraph
} from "./shenava.js"

const execFileAsync = promisify(execFile)

type ShenavaModel = {
  dir: string
  graph: ShenavaGraph
  tokens: string[]
  filters: number[][]
}

type WorkerClient = {
  dir: string
  worker: Worker
  pending: Map<number, { resolve: (segments: CaptionSegment[]) => void; reject: (error: Error) => void }>
}

export function createSpeechRecognizer(modelsRoot: string): SpeechRecognizer {
  let workerClient: WorkerClient | null = null
  let inProcess: ShenavaModel | null = null
  let nextWindowId = 1

  async function inferWindow(window: PcmWindow, modelPath: string): Promise<CaptionSegment[]> {
    const client = await ensureWorker(modelPath)
    if (client) {
      const id = nextWindowId
      nextWindowId += 1
      return inferOnWorker(client, id, window)
    }
    const model = await ensureInProcess(modelPath)
    return captionShenavaWindow(window.pcm, model, {
      windowStartSeconds: window.offset / SHENAVA_SAMPLE_RATE,
      isFirst: window.isFirst,
      isLast: window.isLast
    })
  }

  async function ensureWorker(modelPath: string): Promise<WorkerClient | null> {
    if (workerClient?.dir === modelPath) return workerClient
    workerClient?.worker.terminate()
    workerClient = null
    const workerFile = shenavaWorkerFile()
    if (!workerFile) return null
    let worker: Worker | null = null
    try {
      worker = new Worker(workerFile)
      const started = worker
      const client: WorkerClient = { dir: modelPath, worker: started, pending: new Map() }
      started.on("message", (msg: { type: string; id?: number; segments?: CaptionSegment[]; message?: string }) => {
        if (msg.type === "error") {
          const pending = msg.id !== undefined ? client.pending.get(msg.id) : undefined
          pending?.reject(new Error(msg.message ?? "Shenava worker failed"))
          if (msg.id !== undefined) client.pending.delete(msg.id)
          return
        }
        if (msg.type === "segments" && msg.id !== undefined) {
          client.pending.get(msg.id)?.resolve(msg.segments ?? [])
          client.pending.delete(msg.id)
        }
      })
      started.on("error", (error) => {
        const wrapped = error instanceof Error ? error : new Error(String(error))
        for (const pending of client.pending.values()) pending.reject(wrapped)
        client.pending.clear()
        if (workerClient === client) workerClient = null
      })
      await new Promise<void>((resolve, reject) => {
        const onReady = (msg: { type: string; message?: string }) => {
          if (msg.type === "ready") {
            started.off("message", onReady)
            resolve()
            return
          }
          if (msg.type === "error") {
            started.off("message", onReady)
            reject(new Error(msg.message ?? "Shenava worker failed to start"))
          }
        }
        started.on("message", onReady)
        started.once("error", reject)
        started.postMessage({ type: "init", modelDir: modelPath })
      })
      workerClient = client
      return client
    } catch {
      worker?.terminate()
      workerClient = null
      return null
    }
  }

  async function ensureInProcess(modelPath: string): Promise<ShenavaModel> {
    if (inProcess?.dir === modelPath) return inProcess
    const { tokens, filters } = loadShenavaSidecars(modelPath)
    inProcess = {
      dir: modelPath,
      graph: await createOnnxShenavaGraph(modelPath),
      tokens,
      filters
    }
    return inProcess
  }

  return {
    async caption({ modelId, videoPath, onSegment, onProgress }) {
      if (modelId === REQUIRED_MODELS.parakeet) {
        const pcm = await extractPcm16k(videoPath)
        await runParakeet(modelDir(modelsRoot, modelId), pcm, onSegment)
        await onProgress?.(1)
        return
      }
      if (modelId === REQUIRED_MODELS.shenava) {
        await runShenavaStreaming(
          videoPath,
          onSegment,
          onProgress,
          (window) => inferWindow(window, modelDir(modelsRoot, modelId))
        )
        return
      }
      throw new Error(`Unknown ASR Model: ${modelId}`)
    }
  }
}

function inferOnWorker(client: WorkerClient, id: number, window: PcmWindow): Promise<CaptionSegment[]> {
  const copy = window.pcm.slice()
  return new Promise((resolve, reject) => {
    client.pending.set(id, { resolve, reject })
    client.worker.postMessage(
      {
        type: "window",
        id,
        pcm: copy,
        windowStartSeconds: window.offset / SHENAVA_SAMPLE_RATE,
        isFirst: window.isFirst,
        isLast: window.isLast
      },
      [copy.buffer]
    )
  })
}

function shenavaWorkerFile(): string | null {
  const here = dirname(fileURLToPath(import.meta.url))
  const bundled = join(here, "shenavaWorker.js")
  const unpacked = bundled.replace(`${sep}app.asar${sep}`, `${sep}app.asar.unpacked${sep}`)
  if (unpacked !== bundled && existsSync(unpacked)) return unpacked
  return existsSync(bundled) ? bundled : null
}

async function runShenavaStreaming(
  videoPath: string,
  onSegment: (segment: CaptionSegment) => void | Promise<void>,
  onProgress: ((progress: number) => void | Promise<void>) | undefined,
  infer: (window: PcmWindow) => Promise<CaptionSegment[]>
): Promise<void> {
  try {
    const totalSamples = await probePcmSamples(videoPath)
    const assembler = new PcmWindowAssembler()
    const runWindow = async (window: PcmWindow) => {
      for (const segment of await infer(window)) await onSegment(segment)
      const done = window.offset + window.pcm.length
      const fraction = totalSamples ? done / totalSamples : window.isLast ? 1 : 0.5
      await onProgress?.(Math.min(0.99, fraction))
    }
    await streamFfmpegPcm(videoPath, async (chunk) => {
      for (const window of assembler.push(chunk)) await runWindow(window)
    })
    const last = assembler.flush()
    if (last) await runWindow(last)
    await onProgress?.(1)
  } catch (error) {
    throw new Error(
      `Shenava Captioning failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

async function streamFfmpegPcm(
  videoPath: string,
  onChunk: (chunk: Buffer) => Promise<void>
): Promise<void> {
  const ffmpeg = await resolveFfmpeg()
  const child = spawn(ffmpeg, [
    "-hide_banner",
    "-i",
    videoPath,
    "-ac",
    "1",
    "-ar",
    String(SHENAVA_SAMPLE_RATE),
    "-f",
    "f32le",
    "pipe:1"
  ])
  child.stderr?.resume()
  let chain = Promise.resolve()
  child.stdout.on("data", (chunk: Buffer) => {
    chain = chain.then(() => onChunk(chunk))
  })
  await new Promise<void>((resolve, reject) => {
    child.on("error", reject)
    child.on("close", (code) => {
      void chain.then(() => {
        if (code !== 0) reject(new Error(`ffmpeg exited with code ${code}`))
        else resolve()
      }, reject)
    })
  })
}

async function probePcmSamples(videoPath: string): Promise<number | null> {
  const seconds = await probeDurationSeconds(videoPath)
  return seconds === null ? null : Math.round(seconds * SHENAVA_SAMPLE_RATE)
}

async function probeDurationSeconds(videoPath: string): Promise<number | null> {
  const ffmpeg = await resolveFfmpeg()
  try {
    await execFileAsync(ffmpeg, ["-hide_banner", "-i", videoPath], { encoding: "utf8" })
  } catch (error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? "")
    const match = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr)
    if (!match) return null
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
  }
  return null
}

async function extractPcm16k(videoPath: string): Promise<Float32Array> {
  const ffmpeg = await resolveFfmpeg()
  const { stdout } = await execFileAsync(
    ffmpeg,
    ["-i", videoPath, "-ac", "1", "-ar", "16000", "-f", "f32le", "pipe:1"],
    { encoding: "buffer", maxBuffer: 1024 * 1024 * 512 }
  )
  return new Float32Array(stdout.buffer, stdout.byteOffset, stdout.byteLength / 4)
}

async function resolveFfmpeg(): Promise<string> {
  try {
    const mod = await import("ffmpeg-static")
    const path = (mod.default ?? mod) as unknown as string | null
    if (path) return path
  } catch {
    /* fall through */
  }
  return "ffmpeg"
}

async function runParakeet(
  modelPath: string,
  pcm: Float32Array,
  onSegment: (segment: CaptionSegment) => void | Promise<void>
): Promise<void> {
  try {
    const parakeet = await import("parakeet.js")
    const decoder =
      firstExisting(modelPath, ["decoder_joint-model.int8.onnx", "decoder_joint-model.onnx"]) ??
      ""
    const encoder =
      firstExisting(modelPath, ["encoder-model.int8.onnx", "encoder-model.onnx"]) ?? ""
    const model = await parakeet.fromUrls({
      encoderUrl: pathToFileUrl(encoder),
      decoderUrl: pathToFileUrl(decoder),
      tokenizerUrl: pathToFileUrl(join(modelPath, "vocab.txt")),
      backend: "wasm",
      preprocessorBackend: "js"
    })
    const result = (await model.transcribe(pcm, 16000, { returnTimestamps: true })) as {
      utterance_text?: string
      text?: string
      chunks?: { text: string; start: number; end: number }[]
    }
    const chunks = result.chunks ?? [
      {
        text: result.utterance_text ?? result.text ?? "",
        start: 0,
        end: pcm.length / 16000
      }
    ]
    for (const chunk of chunks) {
      const text = chunk.text?.trim()
      if (!text) continue
      await onSegment({
        startSeconds: chunk.start ?? 0,
        endSeconds: chunk.end ?? chunk.start ?? 0,
        text
      })
    }
  } catch (error) {
    throw new Error(
      `Parakeet Captioning failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

function firstExisting(dir: string, names: string[]): string | null {
  for (const name of names) {
    const files = readdirSync(dir)
    if (files.includes(name)) return join(dir, name)
  }
  return null
}

function pathToFileUrl(path: string): string {
  const prefix = process.platform === "win32" ? "file:///" : "file://"
  return prefix + path.replaceAll("\\", "/")
}
