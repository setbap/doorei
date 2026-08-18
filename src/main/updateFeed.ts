import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { basename, dirname } from "node:path"

export type UpdateFeed = {
  version: string
  path: string
  sha512: string
  size: number
  releaseDate: string
}

export type WriteUpdateFeedInput = {
  version: string
  artifactPath: string
  outFile: string
  releaseDate?: string
}

export function writeUpdateFeed(input: WriteUpdateFeedInput): UpdateFeed {
  const bytes = readFileSync(input.artifactPath)
  const feed: UpdateFeed = {
    version: input.version,
    path: basename(input.artifactPath),
    sha512: createHash("sha512").update(bytes).digest("base64"),
    size: statSync(input.artifactPath).size,
    releaseDate: input.releaseDate ?? new Date().toISOString()
  }
  mkdirSync(dirname(input.outFile), { recursive: true })
  writeFileSync(input.outFile, `${renderUpdateFeed(feed)}\n`)
  return feed
}

export function renderUpdateFeed(feed: UpdateFeed): string {
  return [
    `version: ${feed.version}`,
    "files:",
    `  - url: ${feed.path}`,
    `    sha512: ${feed.sha512}`,
    `    size: ${feed.size}`,
    `path: ${feed.path}`,
    `sha512: ${feed.sha512}`,
    `releaseDate: '${feed.releaseDate}'`
  ].join("\n")
}
