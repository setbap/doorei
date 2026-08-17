import { existsSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

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

function writeIcnsFromPng(png: string, dest: string): void {
  const iconset = join(tmpdir(), `doorei-${process.pid}.iconset`)
  mkdirSync(iconset, { recursive: true })
  const sizes: Array<[number, string]> = [
    [16, "icon_16x16.png"],
    [32, "icon_16x16@2x.png"],
    [32, "icon_32x32.png"],
    [64, "icon_32x32@2x.png"],
    [128, "icon_128x128.png"],
    [256, "icon_128x128@2x.png"],
    [256, "icon_256x256.png"],
    [512, "icon_256x256@2x.png"],
    [512, "icon_512x512.png"],
    [1024, "icon_512x512@2x.png"]
  ]
  try {
    for (const [size, name] of sizes) {
      const result = spawnSync("sips", ["-z", String(size), String(size), png, "--out", join(iconset, name)], {
        encoding: "utf8"
      })
      if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || `sips ${name} failed`)
      }
    }
    const result = spawnSync("iconutil", ["-c", "icns", iconset, "-o", dest], { encoding: "utf8" })
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || "iconutil failed")
    }
  } finally {
    rmSync(iconset, { recursive: true, force: true })
  }
}

if (process.platform === "darwin" && existsSync(PLIST)) {
  replaceString("CFBundleName")
  replaceString("CFBundleDisplayName")
  const png = join(ROOT, "build/mac.png")
  const dest = join(APP, "Contents/Resources/electron.icns")
  if (existsSync(png) && existsSync(dest)) writeIcnsFromPng(png, dest)
}
