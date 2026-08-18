import { existsSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { createEmbedder, createEmbeddingWorkerSession } from "../../src/adapters/embedder.js"
import { modelDir } from "../../src/adapters/modelStore.js"
import { cosine } from "../../src/library/createLibrary/helpers.js"
import { destFilesForModel, REQUIRED_MODELS } from "../../src/library/models.js"

const fixtureWorker = fileURLToPath(new URL("./fixtures/embed-worker.mjs", import.meta.url))

const modelsRoot = join(process.cwd(), "resources/models")
const embeddingReady = destFilesForModel(REQUIRED_MODELS.embedding).every((file) =>
  existsSync(join(modelDir(modelsRoot, REQUIRED_MODELS.embedding), file))
)

describe("Embedding Model", () => {
  test("drops the session after idle so Search does not keep native weights for the rest of the day", async () => {
    let created = 0
    let disposed = 0
    const embedder = createEmbedder("/models", {
      idleMs: 25,
      async createSession() {
        created += 1
        return {
          async embed(texts) {
            return texts.map(() => [1, 0])
          },
          async dispose() {
            disposed += 1
          }
        }
      }
    })
    await embedder.embed(["باگ"])
    await embedder.embed(["OWASP"])
    expect(created).toBe(1)
    expect(disposed).toBe(0)
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(disposed).toBe(1)
    await embedder.embed(["هاند"])
    expect(created).toBe(2)
  })

  test("kills the Embedding Model worker after idle so Search can drop @huggingface/transformers", async () => {
    const embedder = createEmbedder("/models", {
      idleMs: 25,
      createSession: (modelPath) => createEmbeddingWorkerSession(modelPath, fixtureWorker)
    })
    expect(await embedder.embed(["باگ"])).toEqual([[1, 0]])
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(await embedder.embed(["OWASP"])).toEqual([[1, 0]])
  })

  test("a disposed Embedding Model worker cannot embed", async () => {
    const session = await createEmbeddingWorkerSession("/models", fixtureWorker)
    expect(await session.embed(["باگ"])).toEqual([[1, 0]])
    await session.dispose()
    await expect(session.embed(["OWASP"])).rejects.toThrow()
  })

  test.skipIf(!embeddingReady)(
    "paraphrases are closer than unrelated text after onnxruntime-node is already loaded",
    async () => {
      await import("onnxruntime-node")
      const embedder = createEmbedder(modelsRoot, { createSession: createInProcessSession })
      const [passage, paraphrase, unrelated] = await embedder.embed([
        "ask not what your country can do for you",
        "do not ask what the country can do for you",
        "the birch canoe slid on the smooth planks"
      ])
      expect(passage?.length).toBeGreaterThan(8)
      expect(paraphrase).toHaveLength(passage!.length)
      expect(unrelated).toHaveLength(passage!.length)
      expect(cosine(passage!, paraphrase!)).toBeGreaterThan(cosine(passage!, unrelated!))
    },
    60_000
  )
})

async function createInProcessSession(modelPath: string) {
  const transformers = await import("@huggingface/transformers")
  const pipe = await transformers.pipeline("feature-extraction", modelPath, {
    local_files_only: true,
    dtype: "q8"
  })
  return {
    async embed(texts: string[]) {
      const result = await pipe(texts, { pooling: "mean", normalize: true })
      return result.tolist() as number[][]
    },
    async dispose() {
      await pipe.dispose()
    }
  }
}
