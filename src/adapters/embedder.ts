import { existsSync } from "node:fs"
import { dirname, join, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { Worker } from "node:worker_threads"
import type { Embedder } from "../library/index.js"
import { REQUIRED_MODELS } from "../library/index.js"
import { modelDir } from "./modelStore.js"

/** After the last embed, kill the worker so Search does not pin @huggingface/transformers. */
export const EMBEDDING_SESSION_IDLE_MS = 30_000

export type EmbeddingSession = {
  embed(texts: string[]): Promise<number[][]>
  dispose(): Promise<void>
}

export type EmbedderOptions = {
  idleMs?: number
  createSession?: (modelPath: string) => Promise<EmbeddingSession>
}

type PendingEmbed = {
  resolve: (vectors: number[][]) => void
  reject: (error: Error) => void
}

type WorkerResponse =
  | { type: "ready" }
  | { type: "vectors"; id: number; vectors: number[][] }
  | { type: "error"; id?: number; message: string }

export function createEmbedder(modelsRoot: string, options: EmbedderOptions = {}): Embedder {
  const idleMs = options.idleMs ?? EMBEDDING_SESSION_IDLE_MS
  const createSession = options.createSession ?? createTransformersSession
  const modelPath = join(modelDir(modelsRoot, REQUIRED_MODELS.embedding))
  let session: EmbeddingSession | null = null
  let inflight = 0
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let loading: Promise<EmbeddingSession> | null = null
  let gate = Promise.resolve()

  function clearIdle(): void {
    if (idleTimer == null) return
    clearTimeout(idleTimer)
    idleTimer = null
  }

  async function dropSession(): Promise<void> {
    if (inflight > 0) return
    clearIdle()
    const current = session
    session = null
    loading = null
    if (current) await current.dispose()
  }

  function scheduleIdle(): void {
    clearIdle()
    if (inflight > 0) return
    idleTimer = setTimeout(() => {
      gate = gate.then(dropSession, dropSession)
    }, idleMs)
  }

  async function sessionReady(): Promise<EmbeddingSession> {
    if (session) return session
    if (!loading) {
      loading = createSession(modelPath).then((next) => {
        session = next
        return next
      })
      loading.catch(() => {
        loading = null
      })
    }
    return loading
  }

  return {
    async embed(texts) {
      if (texts.length === 0) return []
      inflight += 1
      clearIdle()
      try {
        await gate
        const ready = await sessionReady()
        return await ready.embed(texts)
      } finally {
        inflight -= 1
        scheduleIdle()
      }
    }
  }
}

export async function createEmbeddingWorkerSession(
  modelPath: string,
  workerFile: string
): Promise<EmbeddingSession> {
  const worker = new Worker(workerFile)
  const pending = new Map<number, PendingEmbed>()
  let nextId = 1
  let dead = false

  function failAll(error: Error): void {
    for (const item of pending.values()) item.reject(error)
    pending.clear()
  }

  worker.on("message", (msg: WorkerResponse) => {
    if (msg.type === "vectors") {
      pending.get(msg.id)?.resolve(msg.vectors)
      pending.delete(msg.id)
      return
    }
    if (msg.type === "error" && msg.id !== undefined) {
      pending.get(msg.id)?.reject(new Error(msg.message ?? "Embedding worker failed"))
      pending.delete(msg.id)
    }
  })
  worker.on("error", (error) => {
    dead = true
    failAll(error instanceof Error ? error : new Error(String(error)))
  })
  worker.on("exit", (code) => {
    dead = true
    if (pending.size === 0) return
    failAll(new Error(`Embedding worker exited (${code ?? "unknown"})`))
  })

  await new Promise<void>((resolve, reject) => {
    const onReady = (msg: WorkerResponse) => {
      if (msg.type === "ready") {
        worker.off("message", onReady)
        worker.off("error", onError)
        resolve()
        return
      }
      if (msg.type === "error") {
        worker.off("message", onReady)
        worker.off("error", onError)
        reject(new Error(msg.message ?? "Embedding worker failed to start"))
      }
    }
    const onError = (error: Error) => {
      worker.off("message", onReady)
      reject(error)
    }
    worker.on("message", onReady)
    worker.once("error", onError)
    worker.postMessage({ type: "init", modelDir: modelPath })
  })

  return {
    async embed(texts) {
      if (dead) throw new Error("Embedding worker is gone")
      const id = nextId
      nextId += 1
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        worker.postMessage({ type: "embed", id, texts })
      })
    },
    async dispose() {
      dead = true
      failAll(new Error("Embedding worker disposed"))
      await worker.terminate()
    }
  }
}

async function createTransformersSession(modelPath: string): Promise<EmbeddingSession> {
  const file = bundledEmbeddingWorkerFile()
  if (!file) throw new Error("Embedding worker is missing")
  return createEmbeddingWorkerSession(modelPath, file)
}

function bundledEmbeddingWorkerFile(): string | null {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [join(here, "embeddingWorker.js"), join(here, "..", "embeddingWorker.js")]
  for (const bundled of candidates) {
    const unpacked = bundled.replace(`${sep}app.asar${sep}`, `${sep}app.asar.unpacked${sep}`)
    if (unpacked !== bundled && existsSync(unpacked)) return unpacked
    if (existsSync(bundled)) return bundled
  }
  return null
}
