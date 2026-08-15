import { execFile, spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { Worker } from "node:worker_threads"
import { promisify } from "node:util"
import { REQUIRED_MODELS, type CaptionSegment, type SpeechRecognizer } from "../library/index.js"
import { modelDir } from "./modelStore.js"
import {
  captionParakeetWindow,
  createOnnxParakeetGraph,
  loadParakeetVocab,
  PcmWindowAssembler as ParakeetAssembler,
  PARAKEET_SAMPLE_RATE,
  type ParakeetGraph,
  type PcmWindow as ParakeetWindow
} from "./parakeet.js"
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

type ParakeetModel = {
  dir: string
  graph: ParakeetGraph
  tokens: string[]
  blankId: number
}

type WorkerClient = {
  dir: string
  worker: Worker
  pending: Map<number, { resolve: (segments: CaptionSegment[]) => void; reject: (error: Error) => void }>
}

export function createSpeechRecognizer(modelsRoot: string): SpeechRecognizer {
  let workerClient: WorkerClient | null = null
  let shenavaInProcess: ShenavaModel | null = null
  let parakeetInProcess: ParakeetModel | null = null
  let nextWindowId = 1

  async function inferShenavaWindow(window: PcmWindow, modelPath: string): Promise<CaptionSegment[]> {
    const client = await ensureWorker(modelPath, "shenavaWorker.js", "Shenava")
    if (client) {
      const id = nextWindowId
      nextWindowId += 1
      return inferOnWorker(client, id, window, SHENAVA_SAMPLE_RATE)
    }
    const model = await ensureShenava(modelPath)
    return captionShenavaWindow(window.pcm, model, {
      windowStartSeconds: window.offset / SHENAVA_SAMPLE_RATE,
      isFirst: window.isFirst,
      isLast: window.isLast
    })
  }

  async function inferParakeetWindow(window: ParakeetWindow, modelPath: string): Promise<CaptionSegment[]> {
    const client = await ensureWorker(modelPath, "parakeetWorker.js", "Parakeet")
    if (client) {
      const id = nextWindowId
      nextWindowId += 1
      return inferOnWorker(client, id, window, PARAKEET_SAMPLE_RATE)
    }
    const model = await ensureParakeet(modelPath)
    return captionParakeetWindow(window.pcm, model, {
      windowStartSeconds: window.offset / PARAKEET_SAMPLE_RATE,
      isFirst: window.isFirst,
      isLast: window.isLast
    })
  }

  async function ensureWorker(
    modelPath: string,
    fileName: string,
    label: string
  ): Promise<WorkerClient | null> {
    if (workerClient?.dir === modelPath) return workerClient
    workerClient?.worker.terminate()
    workerClient = null
    const workerFile = bundledWorkerFile(fileName)
    if (!workerFile) return null
    let worker: Worker | null = null
    try {
      worker = new Worker(workerFile)
      const started = worker
      const client: WorkerClient = { dir: modelPath, worker: started, pending: new Map() }
      started.on("message", (msg: { type: string; id?: number; segments?: CaptionSegment[]; message?: string }) => {
        if (msg.type === "error") {
          const pending = msg.id !== undefined ? client.pending.get(msg.id) : undefined
          pending?.reject(new Error(msg.message ?? `${label} worker failed`))
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
            reject(new Error(msg.message ?? `${label} worker failed to start`))
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

  async function ensureShenava(modelPath: string): Promise<ShenavaModel> {
    if (shenavaInProcess?.dir === modelPath) return shenavaInProcess
    const { tokens, filters } = loadShenavaSidecars(modelPath)
    shenavaInProcess = {
      dir: modelPath,
      graph: await createOnnxShenavaGraph(modelPath),
      tokens,
      filters
    }
    return shenavaInProcess
  }

  async function ensureParakeet(modelPath: string): Promise<ParakeetModel> {
    if (parakeetInProcess?.dir === modelPath) return parakeetInProcess
    const { tokens, blankId } = loadParakeetVocab(modelPath)
    parakeetInProcess = {
      dir: modelPath,
      graph: await createOnnxParakeetGraph(modelPath, blankId),
      tokens,
      blankId
    }
    return parakeetInProcess
  }

  return {
    async caption({ modelId, videoPath, onSegment, onProgress }) {
      if (modelId === REQUIRED_MODELS.parakeet) {
        await runParakeetStreaming(videoPath, onSegment, onProgress, (window) =>
          inferParakeetWindow(window, modelDir(modelsRoot, modelId))
        )
        return
      }
      if (modelId === REQUIRED_MODELS.shenava) {
        await runShenavaStreaming(videoPath, onSegment, onProgress, (window) =>
          inferShenavaWindow(window, modelDir(modelsRoot, modelId))
        )
        return
      }
      throw new Error(`Unknown ASR Model: ${modelId}`)
    }
  }
}

function inferOnWorker(
  client: WorkerClient,
  id: number,
  window: { pcm: Float32Array; offset: number; isFirst: boolean; isLast: boolean },
  sampleRate: number
): Promise<CaptionSegment[]> {
  const copy = window.pcm.slice()
  return new Promise((resolve, reject) => {
    client.pending.set(id, { resolve, reject })
    client.worker.postMessage(
      {
        type: "window",
        id,
        pcm: copy,
        windowStartSeconds: window.offset / sampleRate,
        isFirst: window.isFirst,
        isLast: window.isLast
      },
      [copy.buffer]
    )
  })
}

function bundledWorkerFile(fileName: string): string | null {
  const here = dirname(fileURLToPath(import.meta.url))
  const bundled = join(here, fileName)
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
    await streamWindows(videoPath, new PcmWindowAssembler(), infer, onSegment, onProgress)
  } catch (error) {
    throw new Error(`Shenava Captioning failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function runParakeetStreaming(
  videoPath: string,
  onSegment: (segment: CaptionSegment) => void | Promise<void>,
  onProgress: ((progress: number) => void | Promise<void>) | undefined,
  infer: (window: ParakeetWindow) => Promise<CaptionSegment[]>
): Promise<void> {
  try {
    await streamWindows(videoPath, new ParakeetAssembler(), infer, onSegment, onProgress)
  } catch (error) {
    throw new Error(`Parakeet Captioning failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function streamWindows(
  videoPath: string,
  assembler: { push(chunk: Buffer): Array<{ pcm: Float32Array; offset: number; isFirst: boolean; isLast: boolean }>; flush(): { pcm: Float32Array; offset: number; isFirst: boolean; isLast: boolean } | null },
  infer: (window: { pcm: Float32Array; offset: number; isFirst: boolean; isLast: boolean }) => Promise<CaptionSegment[]>,
  onSegment: (segment: CaptionSegment) => void | Promise<void>,
  onProgress: ((progress: number) => void | Promise<void>) | undefined
): Promise<void> {
  const totalSamples = await probePcmSamples(videoPath)
  const runWindow = async (window: { pcm: Float32Array; offset: number; isFirst: boolean; isLast: boolean }) => {
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
