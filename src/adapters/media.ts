import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import type { MediaFiles } from "../library/index.js"

const VIDEO_EXT = new Set([".mp4", ".mkv", ".webm", ".mov", ".m4v", ".avi"])
const CAPTION_EXT = [".srt", ".vtt"]

export function createNodeMedia(): MediaFiles {
  return {
    exists: (path) => existsSync(path),
    readText: (path) => readFileSync(path, "utf8"),
    captionSidecar: (videoPath) => {
      const base = videoPath.replace(/\.[^.]+$/, "")
      for (const ext of CAPTION_EXT) {
        const candidate = `${base}${ext}`
        if (existsSync(candidate)) return candidate
      }
      return null
    }
  }
}

export function videoPathsInFolder(folder: string): string[] {
  const entries = readdirSync(folder, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && VIDEO_EXT.has(extname(entry.name)))
    .map((entry) => join(folder, entry.name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

function extname(name: string): string {
  const index = name.lastIndexOf(".")
  return index >= 0 ? name.slice(index).toLowerCase() : ""
}
