import { existsSync } from "node:fs"
import { join } from "node:path"
import type { ModelStore } from "../library/index.js"

export function modelDir(modelsRoot: string, modelId: string): string {
  return join(modelsRoot, modelId.replaceAll("/", "--"))
}

export function createDiskModelStore(modelsRoot: string): ModelStore {
  return {
    isComplete: (modelId) => existsSync(join(modelDir(modelsRoot, modelId), ".complete"))
  }
}
