import { existsSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { createEmbedder } from "../../src/adapters/embedder.js"
import { modelDir } from "../../src/adapters/modelStore.js"
import { cosine } from "../../src/library/createLibrary/helpers.js"
import { destFilesForModel, REQUIRED_MODELS } from "../../src/library/models.js"

const modelsRoot = join(process.cwd(), "resources/models")
const embeddingReady = destFilesForModel(REQUIRED_MODELS.embedding).every((file) =>
  existsSync(join(modelDir(modelsRoot, REQUIRED_MODELS.embedding), file))
)

describe("Embedding Model", () => {
  test.skipIf(!embeddingReady)(
    "paraphrases are closer than unrelated text after onnxruntime-node is already loaded",
    async () => {
      await import("onnxruntime-node")
      const embedder = createEmbedder(modelsRoot)
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
