import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import {
  filePathFromMediaRequest,
  planMediaServe,
  serveMediaRequest,
  toMediaUrl
} from "../../src/main/mediaProtocol.js"
import { startMediaServer } from "../../src/main/mediaServer.js"

describe("media protocol URLs", () => {
  test("round-trips a Unix video path, including spaces and non-ASCII names", () => {
    const paths = [
      "/Users/sina/course/lecture.mp4",
      "/Users/sina/course/lecture 1.mp4",
      "/Users/sina/درس/جلسه-۱.mp4"
    ]
    for (const filePath of paths) {
      const url = toMediaUrl(filePath)
      expect(url.startsWith("media://doorei/")).toBe(true)
      expect(url.includes("localhost")).toBe(false)
      expect(filePathFromMediaRequest(url)).toBe(filePath)
    }
  })

  test("keeps the file path after the host so Chromium does not treat Users as the host", () => {
    const url = toMediaUrl("/Users/sina/Movies/OWASP/seen/live-00-14040725-part-01.mp4")
    expect(url).toBe("media://doorei/Users/sina/Movies/OWASP/seen/live-00-14040725-part-01.mp4")
    expect(new URL(url).hostname).toBe("doorei")
  })

  test("reads a path out of a Chromium-parsed media://doorei URL", () => {
    const filePath = "/Users/sina/course/lecture.mp4"
    expect(filePathFromMediaRequest(toMediaUrl(filePath))).toBe(filePath)
  })

  test("HTTP playback URLs round-trip the file path in a query param", () => {
    const filePath = "/Users/sina/Movies/OWASP/seen/live-00-14040725-part-01.mp4"
    const url = toMediaUrl(filePath, "http://127.0.0.1:9")
    expect(url).toBe(`http://127.0.0.1:9/?p=${encodeURIComponent(filePath)}`)
    expect(filePathFromMediaRequest(url)).toBe(filePath)
  })
})

describe("media protocol range serving", () => {
  test("full GET returns 200 with Accept-Ranges and the whole file", async () => {
    const filePath = tempFile(Buffer.from("0123456789abcdef"))
    const planned = planMediaServe(null, 16)
    expect(planned.status).toBe(200)
    expect(planned.headers["Accept-Ranges"]).toBe("bytes")
    const served = await serveMediaRequest(toMediaUrl(filePath), null)
    expect(served.status).toBe(200)
    expect(Buffer.concat(served.chunks).toString()).toBe("0123456789abcdef")
  })

  test("open-ended Range bytes=0- returns 206 of the whole file", () => {
    const planned = planMediaServe("bytes=0-", 16)
    expect(planned.status).toBe(206)
    expect(planned.start).toBe(0)
    expect(planned.end).toBe(15)
    expect(planned.headers["Content-Range"]).toBe("bytes 0-15/16")
    expect(planned.headers["Content-Length"]).toBe("16")
  })

  test("Range bytes=4-7 returns 206 with that slice", async () => {
    const filePath = tempFile(Buffer.from("0123456789abcdef"))
    const planned = planMediaServe("bytes=4-7", 16)
    expect(planned.status).toBe(206)
    expect(planned.start).toBe(4)
    expect(planned.end).toBe(7)
    expect(planned.headers["Content-Range"]).toBe("bytes 4-7/16")
    expect(planned.headers["Content-Length"]).toBe("4")
    const served = await serveMediaRequest(toMediaUrl(filePath), "bytes=4-7")
    expect(served.status).toBe(206)
    expect(Buffer.concat(served.chunks).toString()).toBe("4567")
  })

  test("local HTTP media server returns 206 for a Range request", async () => {
    const filePath = tempFile(Buffer.from("0123456789abcdef"))
    const media = await startMediaServer()
    try {
      const response = await fetch(toMediaUrl(filePath, media.origin), {
        headers: { Range: "bytes=4-7" }
      })
      expect(response.status).toBe(206)
      expect(response.headers.get("Content-Range")).toBe("bytes 4-7/16")
      expect(await response.text()).toBe("4567")
    } finally {
      await media.close()
    }
  })
})

function tempFile(bytes: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), "doorei-media-"))
  const filePath = join(dir, "clip.mp4")
  writeFileSync(filePath, bytes)
  return filePath
}
