import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { downloadFile, listFiles } from "@huggingface/hub"
import { REQUIRED_MODELS } from "../library/index.js"
import { modelDir } from "./modelStore.js"

export type DownloadProgress = {
  modelId: string
  file: string
  received: number
  total: number | null
}

export async function downloadRequiredModels(
  modelsRoot: string,
  onProgress: (progress: DownloadProgress) => void
): Promise<void> {
  for (const modelId of Object.values(REQUIRED_MODELS)) {
    await downloadRepo(modelsRoot, modelId, onProgress)
  }
}

async function downloadRepo(
  modelsRoot: string,
  modelId: string,
  onProgress: (progress: DownloadProgress) => void
): Promise<void> {
  const destRoot = modelDir(modelsRoot, modelId)
  mkdirSync(destRoot, { recursive: true })
  const files = listFiles({ repo: modelId, recursive: true })
  for await (const file of files) {
    if (file.type !== "file") continue
    if (file.path.startsWith(".") || file.path.includes("/.")) continue
    const dest = join(destRoot, file.path)
    mkdirSync(dirname(dest), { recursive: true })
    const blob = await downloadFile({ repo: modelId, path: file.path })
    if (!blob) continue
    const buffer = Buffer.from(await blob.arrayBuffer())
    writeFileSync(dest, buffer)
    onProgress({
      modelId,
      file: file.path,
      received: buffer.length,
      total: typeof file.size === "number" ? file.size : buffer.length
    })
  }
  writeFileSync(join(destRoot, ".complete"), "ok")
}
