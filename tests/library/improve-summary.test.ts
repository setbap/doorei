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
    expect(library.snapshot().videos.find((video) => video.id === videoId)?.hasSummary).toBe(true)
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
    expect(library.snapshot().videos[0]?.hasSummary).toBe(false)
    expect((await library.search({ text: "useEffect", scope: "video" })).length).toBeGreaterThan(0)
  })

  test("Improve and Summary prompts are customizable", async () => {
    const { library } = await captionLibrary()
    await library.updatePrompt("improve", "custom improve")
    await library.updatePrompt("summary", "custom summary")
    expect(library.snapshot().prompts.improve).toBe("custom improve")
    expect(library.snapshot().prompts.summary).toBe("custom summary")
  })

  test("generateSummary after a Provider is added improves Caption then writes Summary", async () => {
    const providerClient: ProviderClient = {
      async complete({ prompt }) {
        if (prompt.includes("JSON")) {
          return "```json\n" +
            JSON.stringify([
              { startSeconds: 8, endSeconds: 12.4, text: "useEffect runs after paint" }
            ]) +
            "\n```"
        }
        return "```markdown\n## افکت\n\n- debounce\n```"
      }
    }
    const { library } = await captionLibrary(providerClient)
    await library.createCourse("C")
    const sessionId = await library.createSession({ name: "S" })
    const [videoId] = await library.addVideos({ sessionId, paths: ["/lesson.mp4"] })
    await library.selectVideo(videoId)
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(library.snapshot().summary).toBeNull()
    expect(library.snapshot().jobs.some((job) => job.kind === "improve")).toBe(false)

    await library.configureProvider({ kind: "openai", url: "http://x/v1" })
    await library.generateSummary(videoId)
    await waitUntil(() => library.snapshot().improvedCaption !== null, 3000)
    await waitUntil(() => library.snapshot().summary !== null, 3000)
    expect(library.snapshot().improvedCaption?.segments[0]?.text).toContain("useEffect")
    expect(library.snapshot().summary).toBe("## افکت\n\n- debounce")
  })

  test("generateSummary without a Provider is rejected", async () => {
    const { library } = await captionLibrary()
    await library.createCourse("C")
    const sessionId = await library.createSession({ name: "S" })
    const [videoId] = await library.addVideos({ sessionId, paths: ["/lesson.mp4"] })
    await expect(library.generateSummary(videoId)).rejects.toThrow("Provider is not configured")
  })

  test("generateSummary without a Caption is rejected", async () => {
    const providerClient: ProviderClient = {
      async complete() {
        return "should not run"
      }
    }
    const { library } = await unlockedLibrary({
      providerClient,
      media: memoryMedia({ existing: ["/lesson.mp4"] })
    })
    await library.configureProvider({ kind: "openai", url: "http://x/v1" })
    await library.createCourse("C")
    const sessionId = await library.createSession({ name: "S" })
    const [videoId] = await library.addVideos({ sessionId, paths: ["/lesson.mp4"] })
    await waitUntil(
      () =>
        library.snapshot().jobs.some((job) => job.kind === "captioning" && job.status === "complete"),
      3000
    )
    await expect(library.generateSummary(videoId)).rejects.toThrow("No Caption to summarize")
  })

  test("generateSummary queues Improve immediately even if the Provider never returns", async () => {
    const providerClient: ProviderClient = {
      complete: () => new Promise(() => undefined)
    }
    const { library } = await captionLibrary(providerClient)
    await library.configureProvider({ kind: "openai", url: "http://x/v1" })
    await library.createCourse("C")
    const sessionId = await library.createSession({ name: "S" })
    const [videoId] = await library.addVideos({ sessionId, paths: ["/lesson.mp4"] })
    await library.selectVideo(videoId)
    await waitUntil(() => library.snapshot().caption !== null, 3000)
    await library.generateSummary(videoId)
    const job = library.snapshot().jobs.find((item) => item.kind === "improve" && item.videoId === videoId)
    expect(job?.status === "queued" || job?.status === "running").toBe(true)
  })

  test("invalid Improved Caption JSON still writes Summary from the original Caption", async () => {
    const providerClient: ProviderClient = {
      async complete({ prompt }) {
        if (prompt.includes("JSON")) {
          return "this is not JSON at all"
        }
        return "خلاصه از کپشن اصلی"
      }
    }
    const { library } = await captionLibrary(providerClient)
    await library.configureProvider({ kind: "openai", url: "http://x/v1" })
    await library.createCourse("C")
    const sessionId = await library.createSession({ name: "S" })
    const [videoId] = await library.addVideos({ sessionId, paths: ["/lesson.mp4"] })
    await library.selectVideo(videoId)
    await library.generateSummary(videoId)
    await waitUntil(() => library.snapshot().summary !== null, 3000)
    expect(library.snapshot().summary).toBe("خلاصه از کپشن اصلی")
    expect(library.snapshot().improvedCaption).toBeNull()
    expect(
      library.snapshot().jobs.some((job) => job.kind === "improve" && job.status === "failed")
    ).toBe(true)
  })

  test("Improved Caption JSON with unquoted keys is repaired", async () => {
    const providerClient: ProviderClient = {
      async complete({ prompt }) {
        if (prompt.includes("JSON")) {
          return '[{startSeconds: 8, endSeconds: 12.4, text: "useEffect runs after paint"}]'
        }
        return "خلاصه"
      }
    }
    const { library } = await captionLibrary(providerClient)
    await library.configureProvider({ kind: "openai", url: "http://x/v1" })
    await library.createCourse("C")
    const sessionId = await library.createSession({ name: "S" })
    const [videoId] = await library.addVideos({ sessionId, paths: ["/lesson.mp4"] })
    await library.selectVideo(videoId)
    await library.generateSummary(videoId)
    await waitUntil(() => library.snapshot().improvedCaption !== null, 3000)
    expect(library.snapshot().improvedCaption?.segments[0]?.text).toContain("useEffect")
  })

  test("generateMissingSummaries improves then summarizes each Video without a Summary, one by one", async () => {
    const steps: string[] = []
    const providerClient: ProviderClient = {
      async complete({ prompt }) {
        if (prompt.includes("JSON")) {
          steps.push("improve")
          return JSON.stringify([
            { startSeconds: 8, endSeconds: 12.4, text: "useEffect runs after paint" }
          ])
        }
        steps.push("summary")
        return "خلاصه"
      }
    }
    const media = memoryMedia({
      existing: ["/one.mp4", "/two.mp4"],
      sidecars: { "/one.mp4": "/one.srt", "/two.mp4": "/two.srt" },
      files: { "/one.srt": SRT, "/two.srt": SRT }
    })
    const { library } = await unlockedLibrary({ media, providerClient })
    await library.createCourse("C")
    const sessionId = await library.createSession({ name: "S" })
    const [firstId, secondId] = await library.addVideos({
      sessionId,
      paths: ["/one.mp4", "/two.mp4"]
    })
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(library.snapshot().videos.every((video) => !video.hasSummary)).toBe(true)

    await library.configureProvider({ kind: "openai", url: "http://x/v1" })
    await library.generateMissingSummaries()
    await waitUntil(
      () => library.snapshot().videos.filter((video) => video.hasSummary).length === 2,
      3000
    )
    expect(library.snapshot().videos.find((video) => video.id === firstId)?.hasSummary).toBe(true)
    expect(library.snapshot().videos.find((video) => video.id === secondId)?.hasSummary).toBe(true)
    expect(steps).toEqual(["improve", "summary", "improve", "summary"])
  })

  test("generateMissingSummaries skips Videos that already have a Summary or have no Caption", async () => {
    const providerClient: ProviderClient = {
      async complete({ prompt }) {
        if (prompt.includes("JSON")) {
          return JSON.stringify([
            { startSeconds: 8, endSeconds: 12.4, text: "useEffect runs after paint" }
          ])
        }
        return "خلاصه"
      }
    }
    const media = memoryMedia({
      existing: ["/has.mp4", "/need.mp4", "/bare.mp4"],
      sidecars: { "/has.mp4": "/has.srt", "/need.mp4": "/need.srt" },
      files: { "/has.srt": SRT, "/need.srt": SRT }
    })
    const { library } = await unlockedLibrary({ media, providerClient })
    await library.createCourse("C")
    const sessionId = await library.createSession({ name: "S" })
    const [hasId, needId, bareId] = await library.addVideos({
      sessionId,
      paths: ["/has.mp4", "/need.mp4", "/bare.mp4"]
    })
    await waitUntil(
      () =>
        library
          .snapshot()
          .jobs.filter((job) => job.kind === "captioning")
          .every((job) => job.status === "complete" || job.status === "failed"),
      3000
    )
    await library.configureProvider({ kind: "openai", url: "http://x/v1" })
    await library.generateSummary(hasId)
    await waitUntil(
      () => library.snapshot().videos.find((video) => video.id === hasId)?.hasSummary === true,
      3000
    )
    await library.generateMissingSummaries()
    await waitUntil(
      () => library.snapshot().videos.find((video) => video.id === needId)?.hasSummary === true,
      3000
    )
    expect(library.snapshot().videos.find((video) => video.id === hasId)?.hasSummary).toBe(true)
    expect(library.snapshot().videos.find((video) => video.id === bareId)?.hasSummary).toBe(false)
  })

  test("generateMissingSummaries stays in the selected Course", async () => {
    const providerClient: ProviderClient = {
      async complete({ prompt }) {
        if (prompt.includes("JSON")) {
          return JSON.stringify([
            { startSeconds: 8, endSeconds: 12.4, text: "useEffect runs after paint" }
          ])
        }
        return "خلاصه"
      }
    }
    const media = memoryMedia({
      existing: ["/here.mp4", "/there.mp4"],
      sidecars: { "/here.mp4": "/here.srt", "/there.mp4": "/there.srt" },
      files: { "/here.srt": SRT, "/there.srt": SRT }
    })
    const { library } = await unlockedLibrary({ media, providerClient })
    await library.createCourse("Here")
    const hereSession = await library.createSession({ name: "S1" })
    const [hereId] = await library.addVideos({ sessionId: hereSession, paths: ["/here.mp4"] })
    await library.createCourse("There")
    const thereSession = await library.createSession({ name: "S2" })
    const [thereId] = await library.addVideos({ sessionId: thereSession, paths: ["/there.mp4"] })
    await library.selectCourse(library.snapshot().courses.find((course) => course.name === "Here")!.id)
    await new Promise((resolve) => setTimeout(resolve, 40))
    await library.configureProvider({ kind: "openai", url: "http://x/v1" })
    await library.generateMissingSummaries()
    await waitUntil(
      () => library.snapshot().videos.find((video) => video.id === hereId)?.hasSummary === true,
      3000
    )
    expect(library.snapshot().videos.find((video) => video.id === thereId)?.hasSummary).toBe(false)
  })

  test("generateMissingSummaries without a Provider is rejected", async () => {
    const { library } = await captionLibrary()
    await library.createCourse("C")
    await expect(library.generateMissingSummaries()).rejects.toThrow("Provider is not configured")
  })
})
