import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  REQUIRED_MODELS,
  createLibrary,
  type Embedder,
  type Library,
  type MediaFiles,
  type ModelStore,
  type ProviderClient,
  type SpeechRecognizer
} from "../../src/library/index.js"
import { closeAllDbs } from "../../src/library/persist/index.js"

export class MemoryModelStore implements ModelStore {
  private readonly completeIds = new Set<string>()

  isComplete(modelId: string): boolean {
    return this.completeIds.has(modelId)
  }

  markComplete(modelId: string): void {
    this.completeIds.add(modelId)
  }

  markIncomplete(modelId: string): void {
    this.completeIds.delete(modelId)
  }

  markAllRequired(): void {
    for (const id of Object.values(REQUIRED_MODELS)) {
      this.completeIds.add(id)
    }
  }
}

export function memoryMedia(options?: {
  existing?: string[]
  sidecars?: Record<string, string>
  files?: Record<string, string>
}): MediaFiles {
  const existing = new Set(options?.existing ?? [])
  const sidecars = options?.sidecars ?? {}
  const files = options?.files ?? {}
  return {
    exists: (path) => existing.has(path) || path in files || path in sidecars,
    readText: (path) => {
      if (path in files) return files[path]
      if (path in sidecars) return files[sidecars[path]] ?? files[path] ?? ""
      throw new Error(`No text at ${path}`)
    },
    captionSidecar: (videoPath) => sidecars[videoPath] ?? null
  }
}

export function silentRecognizer(): SpeechRecognizer {
  return {
    async caption() {
      /* no segments */
    }
  }
}

export function silentEmbedder(): Embedder {
  return {
    async embed(texts) {
      return texts.map(() => [0, 0, 0])
    }
  }
}

export function createTestLibrary(options?: {
  modelsComplete?: boolean
  media?: MediaFiles
  speechRecognizer?: SpeechRecognizer
  embedder?: Embedder
  providerClient?: ProviderClient
}): {
  library: Library
  modelStore: MemoryModelStore
  dataDir: string
} {
  const dataDir = mkdtempSync(join(tmpdir(), "doorei-"))
  closeAllDbs()
  const modelStore = new MemoryModelStore()
  if (options?.modelsComplete) {
    modelStore.markAllRequired()
  }
  const library = createLibrary({
    dataDir,
    modelStore,
    media: options?.media ?? memoryMedia(),
    speechRecognizer: options?.speechRecognizer ?? silentRecognizer(),
    embedder: options?.embedder ?? silentEmbedder(),
    providerClient: options?.providerClient
  })
  return { library, modelStore, dataDir }
}

export async function unlockedLibrary(
  options?: Parameters<typeof createTestLibrary>[0]
): Promise<ReturnType<typeof createTestLibrary>> {
  const ctx = createTestLibrary({ modelsComplete: true, ...options })
  await ctx.library.chooseAppLanguage("fa")
  return ctx
}

export async function waitUntil(
  predicate: () => boolean,
  timeoutMs = 2000
): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition")
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}
