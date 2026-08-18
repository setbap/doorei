import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { writeUpdateFeed } from "../../src/main/updateFeed.js"

describe("writeUpdateFeed", () => {
  test("writes electron-updater latest.yml for a slim update artifact", () => {
    const root = mkdtempSync(join(tmpdir(), "doorei-feed-"))
    const artifact = join(root, "Doorei-0.2.0-mac-update.zip")
    const outFile = join(root, "latest-mac.yml")
    writeFileSync(artifact, "slim-update-bytes")

    const feed = writeUpdateFeed({
      version: "0.2.0",
      artifactPath: artifact,
      outFile,
      releaseDate: "2026-08-18T00:00:00.000Z"
    })

    const yaml = readFileSync(outFile, "utf8")
    expect(feed.version).toBe("0.2.0")
    expect(feed.path).toBe("Doorei-0.2.0-mac-update.zip")
    expect(feed.size).toBe(Buffer.byteLength("slim-update-bytes"))
    expect(yaml).toContain("version: 0.2.0")
    expect(yaml).toContain("path: Doorei-0.2.0-mac-update.zip")
    expect(yaml).toContain(`size: ${feed.size}`)
    expect(yaml).toContain(`sha512: ${feed.sha512}`)
    expect(yaml).toContain("releaseDate: '2026-08-18T00:00:00.000Z'")
  })

  test("refuses to write a feed when the artifact is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "doorei-feed-"))
    expect(() =>
      writeUpdateFeed({
        version: "0.2.0",
        artifactPath: join(root, "missing.zip"),
        outFile: join(root, "latest.yml")
      })
    ).toThrow(/missing.zip/)
  })
})
