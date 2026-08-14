import {
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs"
import { dirname, join } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { fileURLToPath } from "node:url"
import {
  MODEL_FILES,
  MODEL_PACK_VERSION,
  REQUIRED_MODELS
} from "../src/library/models.ts"

type RequiredModelKey = keyof typeof REQUIRED_MODELS

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const MODELS_ROOT = join(ROOT, "resources", "models")
const USER_AGENT = "doorei-fetch-models/1"

function modelFolder(modelId: string): string {
  return join(MODELS_ROOT, modelId.replaceAll("/", "--"))
}

function resolveUrl(modelId: string, repoPath: string): string {
  return `https://huggingface.co/${modelId}/resolve/main/${repoPath}?download=true`
}

async function downloadFile(url: string, dest: string): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true })
  // Each file is written to a `.part` temp and renamed atomically only after a
  // complete download, so an existing destination is always a finished file.
  // Skip it so a re-run after a failure resumes from the first missing file.
  if (existsSync(dest) && statSync(dest).size > 0) {
    console.log(`skip  ${dest}`)
    return
  }

  const response = await fetch(url, { headers: { "user-agent": USER_AGENT }, redirect: "follow" })
  if (!response.ok || !response.body) {
    throw new Error(`Failed ${url}: ${response.status} ${response.statusText}`)
  }
  const tmp = `${dest}.part`
  rmSync(tmp, { force: true })
  await pipeline(Readable.fromWeb(response.body), createWriteStream(tmp))
  renameSync(tmp, dest)
  console.log(`got   ${dest}`)
}

function pruneUnknown(root: string, relative: string, keep: Set<string>): void {
  const dir = relative ? join(root, relative) : root
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (entry.endsWith(".part")) {
      rmSync(path, { force: true })
      continue
    }
    const rel = relative ? `${relative}/${entry}` : entry
    if (lstatSync(path).isDirectory()) {
      pruneUnknown(root, rel, keep)
      if (readdirSync(path).length === 0) rmSync(path, { recursive: true, force: true })
      continue
    }
    if (!keep.has(rel)) {
      rmSync(path, { force: true })
      console.log(`drop  ${path}`)
    }
  }
}

async function fetchModel(key: RequiredModelKey): Promise<void> {
  const modelId = REQUIRED_MODELS[key]
  const destRoot = modelFolder(modelId)
  mkdirSync(destRoot, { recursive: true })
  for (const file of MODEL_FILES[key]) {
    await downloadFile(resolveUrl(modelId, file.repoPath), join(destRoot, file.destPath))
  }
  pruneUnknown(destRoot, "", new Set(MODEL_FILES[key].map((file) => file.destPath)))
}

async function main(): Promise<void> {
  mkdirSync(MODELS_ROOT, { recursive: true })
  for (const key of Object.keys(REQUIRED_MODELS) as RequiredModelKey[]) {
    console.log(`model ${REQUIRED_MODELS[key]}`)
    await fetchModel(key)
  }
  writeFileSync(
    join(MODELS_ROOT, "pack.json"),
    `${JSON.stringify({ version: MODEL_PACK_VERSION, models: REQUIRED_MODELS }, null, 2)}\n`
  )
  console.log(`pack  ${MODEL_PACK_VERSION}`)
}

await main()
