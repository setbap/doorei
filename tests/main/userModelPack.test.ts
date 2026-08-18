import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { REQUIRED_MODELS, destFilesForModel } from "../../src/library/index.js"
import { resolveModelsRoot } from "../../src/main/userModelPack.js"

function writePack(root: string, version: string): void {
  mkdirSync(root, { recursive: true })
  for (const modelId of Object.values(REQUIRED_MODELS)) {
    const dir = join(root, modelId.replaceAll("/", "--"))
    for (const file of destFilesForModel(modelId)) {
      mkdirSync(join(dir, file, ".."), { recursive: true })
      writeFileSync(join(dir, file), `${version}:${file}`)
    }
  }
  writeFileSync(
    join(root, "pack.json"),
    `${JSON.stringify({ version, models: REQUIRED_MODELS }, null, 2)}\n`
  )
}

describe("resolveModelsRoot", () => {
  test("copies a complete bundled pack into userData on first launch", () => {
    const root = mkdtempSync(join(tmpdir(), "doorei-pack-"))
    const bundledRoot = join(root, "bundled")
    const userRoot = join(root, "user")
    writePack(bundledRoot, "1")

    expect(resolveModelsRoot({ bundledRoot, userRoot, requiredVersion: "1" })).toBe(userRoot)
    expect(readFileSync(join(userRoot, "pack.json"), "utf8")).toContain('"version": "1"')
  })

  test("keeps the user pack when a slim update ships no bundled models", () => {
    const root = mkdtempSync(join(tmpdir(), "doorei-pack-"))
    const bundledRoot = join(root, "bundled")
    const userRoot = join(root, "user")
    writePack(userRoot, "1")
    mkdirSync(bundledRoot, { recursive: true })

    expect(resolveModelsRoot({ bundledRoot, userRoot, requiredVersion: "1" })).toBe(userRoot)
    expect(readFileSync(join(userRoot, "pack.json"), "utf8")).toContain('"version": "1"')
  })

  test("replaces the user pack when the bundle ships a newer pack version", () => {
    const root = mkdtempSync(join(tmpdir(), "doorei-pack-"))
    const bundledRoot = join(root, "bundled")
    const userRoot = join(root, "user")
    writePack(userRoot, "1")
    writePack(bundledRoot, "2")

    expect(resolveModelsRoot({ bundledRoot, userRoot, requiredVersion: "2" })).toBe(userRoot)
    expect(JSON.parse(readFileSync(join(userRoot, "pack.json"), "utf8")).version).toBe("2")
  })

  test("falls back to the bundle when neither pack is complete", () => {
    const root = mkdtempSync(join(tmpdir(), "doorei-pack-"))
    const bundledRoot = join(root, "bundled")
    const userRoot = join(root, "user")
    mkdirSync(bundledRoot, { recursive: true })
    mkdirSync(userRoot, { recursive: true })

    expect(resolveModelsRoot({ bundledRoot, userRoot, requiredVersion: "1" })).toBe(bundledRoot)
  })
})
