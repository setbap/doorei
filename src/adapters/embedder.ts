import { join } from "node:path"
import type { Embedder } from "../library/index.js"
import { REQUIRED_MODELS } from "../library/index.js"
import { modelDir } from "./modelStore.js"

export function createEmbedder(modelsRoot: string): Embedder {
  let extractor: ((texts: string[]) => Promise<number[][]>) | null = null

  return {
    async embed(texts) {
      if (texts.length === 0) return []
      if (!extractor) {
        extractor = await loadExtractor(join(modelDir(modelsRoot, REQUIRED_MODELS.embedding)))
      }
      return extractor(texts)
    }
  }
}

async function loadExtractor(modelPath: string): Promise<(texts: string[]) => Promise<number[][]>> {
  const transformers = await import("@huggingface/transformers")
  const pipe = await transformers.pipeline("feature-extraction", modelPath, {
    local_files_only: true,
    dtype: "q8"
  })
  return async (texts) => {
    const result = await pipe(texts, { pooling: "mean", normalize: true })
    const list = result.tolist() as number[][]
    return list
  }
}
