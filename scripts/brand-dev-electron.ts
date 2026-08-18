import { existsSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { writeIcnsFromPng } from "../src/main/writeIcns.ts"

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const APP = join(ROOT, "node_modules/electron/dist/Electron.app")
const PLIST = join(APP, "Contents/Info.plist")
const NAME = "Doorei"

function replaceString(key: string): void {
  const result = spawnSync("plutil", ["-replace", key, "-string", NAME, PLIST], {
    encoding: "utf8"
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `plutil ${key} failed`)
  }
}

if (process.platform === "darwin" && existsSync(PLIST)) {
  replaceString("CFBundleName")
  replaceString("CFBundleDisplayName")
  const png = join(ROOT, "build/mac.png")
  const dest = join(APP, "Contents/Resources/electron.icns")
  if (existsSync(png) && existsSync(dest)) writeIcnsFromPng(png, dest)
}
