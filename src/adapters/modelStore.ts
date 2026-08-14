import { existsSync } from "node:fs"
import { join } from "node:path"
import { destFilesForModel } from "../library/models.js"
import type { ModelStore } from "../library/index.js"

export function modelDir(modelsRoot: string, modelId: string): string {
  return join(modelsRoot, modelId.replaceAll("/", "--"))
}

export function createDiskModelStore(modelsRoot: string): ModelStore {
  return {
    isComplete: (modelId) => {
      const files = destFilesForModel(modelId)
      if (files.length === 0) return false
      const root = modelDir(modelsRoot, modelId)
      return files.every((file) => existsSync(join(root, file)))
    }
  }
}
