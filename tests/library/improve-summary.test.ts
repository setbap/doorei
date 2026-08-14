import { describe, expect, test } from "vitest"
import { SRT } from "./fixtures.js"
import { memoryMedia, unlockedLibrary, waitUntil } from "./helpers.js"
import type { ProviderClient } from "../../src/library/index.js"

function captionLibrary(providerClient?: ProviderClient) {
  const media = memoryMedia({
    existing: ["/lesson.mp4"],
    sidecars: { "/lesson.mp4": "/lesson.srt" },
    files: { "/lesson.srt": SRT }
  })
  return unlockedLibrary({ media, providerClient })
}

describe("Improved Caption and Summary", () => {
  test("a configured Provider writes Improved Caption then Summary in Output language", async () => {
    const providerClient: ProviderClient = {
      async complete({ prompt }) {
        if (prompt.includes("Improve") || prompt.includes("Rewrite") || prompt.includes("JSON")) {
          return JSON.stringify([
            { startSeconds: 8, endSeconds: 12.4, text: "useEffect runs after paint" },
            { startSeconds: 60, endSeconds: 64, text: "debounce the input" }
          ])
        }
        return "خلاصه درس: افکت و debounce"
      }
    }
    const { library } = await captionLibrary(providerClient)
    await library.configureProvider({ kind: "openai", url: "http://localhost:11434/v1" })
    await library.createCourse("C")
    const sessionId = await library.createSession({ name: "S" })
    const [videoId] = await library.addVideos({ sessionId, paths: ["/lesson.mp4"] })
    await library.selectVideo(videoId)
    await waitUntil(() => library.snapshot().improvedCaption !== null, 3000)
    await waitUntil(() => library.snapshot().summary !== null, 3000)
    expect(library.snapshot().improvedCaption?.segments[0]?.text).toContain("useEffect")
    expect(library.snapshot().summary).toBe("خلاصه درس: افکت و debounce")
    expect(library.snapshot().outputLanguage).toBe("fa")
  })

  test("a Provider failure does not commit a half Improved Caption and can be retried", async () => {
    let fail = true
    const providerClient: ProviderClient = {
      async complete() {
        if (fail) throw new Error("Provider timed out")
        return JSON.stringify([
          { startSeconds: 8, endSeconds: 12.4, text: "useEffect runs after paint" }
        ])
      }
    }
    const { library } = await captionLibrary(providerClient)
    await library.configureProvider({ kind: "openai", url: "http://x/v1" })
    await library.createCourse("C")
    const sessionId = await library.createSession({ name: "S" })
    await library.addVideos({ sessionId, paths: ["/lesson.mp4"] })
    await library.selectVideo(library.snapshot().videos[0]!.id)
    await waitUntil(
      () => library.snapshot().jobs.some((job) => job.kind === "improve" && job.status === "failed"),
      3000
    )
    expect(library.snapshot().improvedCaption).toBeNull()
    expect(library.snapshot().caption).not.toBeNull()
    fail = false
    const job = library.snapshot().jobs.find((item) => item.kind === "improve")
    await library.retryJob(job!.id)
    await waitUntil(() => library.snapshot().improvedCaption !== null, 3000)
  })

  test("with no Provider, Improve and Summary stay off and Search still works", async () => {
    const { library } = await captionLibrary()
    await library.createCourse("C")
    const sessionId = await library.createSession({ name: "S" })
    await library.addVideos({ sessionId, paths: ["/lesson.mp4"] })
    await library.selectVideo(library.snapshot().videos[0]!.id)
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(library.snapshot().jobs.some((job) => job.kind === "improve")).toBe(false)
    expect(library.snapshot().summary).toBeNull()
    expect((await library.search({ text: "useEffect", scope: "video" })).length).toBeGreaterThan(0)
  })

  test("Improve and Summary prompts are customizable", async () => {
    const { library } = await captionLibrary()
    await library.updatePrompt("improve", "custom improve")
    await library.updatePrompt("summary", "custom summary")
    expect(library.snapshot().prompts.improve).toBe("custom improve")
    expect(library.snapshot().prompts.summary).toBe("custom summary")
  })
})
