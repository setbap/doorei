import { cpSync, existsSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { MODEL_PACK_VERSION, REQUIRED_MODELS } from "../library/models.js"
import { createDiskModelStore } from "../adapters/modelStore.js"

export type ModelPackSource = {
  bundledRoot: string
  userRoot: string
  requiredVersion?: string
}

function packVersion(root: string): string | null {
  const file = join(root, "pack.json")
  if (!existsSync(file)) return null
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { version?: unknown }
    return typeof parsed.version === "string" ? parsed.version : null
  } catch {
    return null
  }
}

function packComplete(root: string): boolean {
  const store = createDiskModelStore(root)
  return Object.values(REQUIRED_MODELS).every((id) => store.isComplete(id))
}

function installBundledPack(bundledRoot: string, userRoot: string): string {
  rmSync(userRoot, { recursive: true, force: true })
  cpSync(bundledRoot, userRoot, { recursive: true })
  return userRoot
}

export function resolveModelsRoot(source: ModelPackSource): string {
  const required = source.requiredVersion ?? MODEL_PACK_VERSION
  if (packVersion(source.userRoot) === required && packComplete(source.userRoot)) {
    return source.userRoot
  }
  if (packVersion(source.bundledRoot) === required && packComplete(source.bundledRoot)) {
    return installBundledPack(source.bundledRoot, source.userRoot)
  }
  return source.bundledRoot
}
