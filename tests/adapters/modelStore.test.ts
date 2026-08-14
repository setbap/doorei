import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { REQUIRED_MODELS, destFilesForModel } from "../../src/library/index.js"
import { createDiskModelStore } from "../../src/adapters/modelStore.js"

describe("disk model store", () => {
  test("a model is complete only when every allowlisted file exists", () => {
    const root = mkdtempSync(join(tmpdir(), "doorei-models-"))
    const store = createDiskModelStore(root)
    const modelId = REQUIRED_MODELS.parakeet
    expect(store.isComplete(modelId)).toBe(false)

    const dir = join(root, modelId.replaceAll("/", "--"))
    const files = destFilesForModel(modelId)
    for (const [index, file] of files.entries()) {
      mkdirSync(join(dir, file, ".."), { recursive: true })
      writeFileSync(join(dir, file), "ok")
      expect(store.isComplete(modelId)).toBe(index === files.length - 1)
    }
  })

  test("nested dest paths are required for the Embedding Model", () => {
    const root = mkdtempSync(join(tmpdir(), "doorei-models-"))
    const store = createDiskModelStore(root)
    const modelId = REQUIRED_MODELS.embedding
    const dir = join(root, modelId.replaceAll("/", "--"))
    for (const file of destFilesForModel(modelId)) {
      mkdirSync(join(dir, file, ".."), { recursive: true })
      writeFileSync(join(dir, file), "ok")
    }
    expect(store.isComplete(modelId)).toBe(true)
  })

  test("unknown model ids are incomplete", () => {
    const root = mkdtempSync(join(tmpdir(), "doorei-models-"))
    expect(createDiskModelStore(root).isComplete("unknown/model")).toBe(false)
  })
})
