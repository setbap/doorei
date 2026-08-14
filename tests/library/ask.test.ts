import { describe, expect, test } from "vitest"
import { SRT } from "./fixtures.js"
import { memoryMedia, unlockedLibrary, waitUntil } from "./helpers.js"
import type { ProviderClient } from "../../src/library/index.js"

describe("Ask", () => {
  test("Ask is off when no Provider is configured", async () => {
    const { library } = await unlockedLibrary()
    await library.createCourse("C")
    expect(library.snapshot().askOff).toBe(true)
  })

  test("Ask answers in Output language and cites Hits", async () => {
    const providerClient: ProviderClient = {
      async complete() {
        return JSON.stringify({
          text: "useEffect اجرا می‌شود بعد از paint",
          hitIndexes: [0]
        })
      }
    }
    const media = memoryMedia({
      existing: ["/lesson.mp4"],
      sidecars: { "/lesson.mp4": "/lesson.srt" },
      files: { "/lesson.srt": SRT }
    })
    const { library } = await unlockedLibrary({ media, providerClient })
    await library.configureProvider({ kind: "openai", url: "http://x/v1" })
    await library.createCourse("C")
    const sessionId = await library.createSession({ name: "S" })
    await library.addVideos({ sessionId, paths: ["/lesson.mp4"] })
    await library.selectVideo(library.snapshot().videos[0]!.id)
    await waitUntil(
      () => library.snapshot().jobs.some((job) => job.kind === "embed" && job.status === "complete"),
      3000
    )
    const answer = await library.ask({ question: "when does useEffect run?", scope: "video" })
    expect(answer.text).toContain("useEffect")
    expect(answer.hits.length).toBeGreaterThan(0)
    expect(answer.hits[0]?.startSeconds).toBe(8)
  })

  test("Ask prompt is customizable and a failure is readable", async () => {
    const providerClient: ProviderClient = {
      async complete() {
        throw new Error("Provider refused")
      }
    }
    const media = memoryMedia({
      existing: ["/lesson.mp4"],
      sidecars: { "/lesson.mp4": "/lesson.srt" },
      files: { "/lesson.srt": SRT }
    })
    const { library } = await unlockedLibrary({ media, providerClient })
    await library.configureProvider({ kind: "openai", url: "http://x/v1" })
    await library.updatePrompt("ask", "answer briefly")
    await library.createCourse("C")
    const sessionId = await library.createSession({ name: "S" })
    await library.addVideos({ sessionId, paths: ["/lesson.mp4"] })
    await library.selectVideo(library.snapshot().videos[0]!.id)
    await expect(library.ask({ question: "why?", scope: "video" })).rejects.toThrow("Provider refused")
    expect(library.snapshot().prompts.ask).toBe("answer briefly")
  })
})
