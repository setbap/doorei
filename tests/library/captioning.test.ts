import { describe, expect, test } from "vitest"
import { REQUIRED_MODELS } from "../../src/library/index.js"
import { SRT } from "./fixtures.js"
import {
  memoryMedia,
  silentEmbedder,
  unlockedLibrary,
  waitUntil
} from "./helpers.js"
import type { CaptionSegment, SpeechRecognizer } from "../../src/library/index.js"

function streamingRecognizer(segments: CaptionSegment[], options?: { failAfter?: number }): SpeechRecognizer {
  return {
    async caption(input) {
      for (const [index, segment] of segments.entries()) {
        if (options?.failAfter !== undefined && index >= options.failAfter) {
          throw new Error("ASR ran out of memory")
        }
        await input.onSegment(segment)
      }
    }
  }
}

const SEGMENTS: CaptionSegment[] = [
  { startSeconds: 0, endSeconds: 2, text: "hello world" },
  { startSeconds: 2, endSeconds: 4, text: "typed useEffect" }
]

describe("Captioning pipeline", () => {
  test("adding a Video with no caption file enqueues Captioning without blocking playback", async () => {
    const media = memoryMedia({ existing: ["/v.mp4"] })
    const { library } = await unlockedLibrary({
      media,
      speechRecognizer: streamingRecognizer(SEGMENTS)
    })
    await library.createCourse("C")
    const sessionId = await library.createSession({ name: "S" })
    const [videoId] = await library.addVideos({ sessionId, paths: ["/v.mp4"] })
    await library.selectVideo(videoId)
    expect(library.snapshot().videos[0]?.fileMissing).toBe(false)
    await waitUntil(() => library.snapshot().caption?.segments.length === 2)
    expect(library.snapshot().caption?.source).toBe("asr")
    expect(library.snapshot().caption?.segments[1]?.text).toBe("typed useEffect")
  })

  test("Captioning progress is persisted and is not Playback Position", async () => {
    const media = memoryMedia({ existing: ["/v.mp4"] })
    const { library, dataDir, modelStore } = await unlockedLibrary({
      media,
      speechRecognizer: streamingRecognizer(SEGMENTS)
    })
    await library.createCourse("C")
    const sessionId = await library.createSession({ name: "S" })
    const [videoId] = await library.addVideos({ sessionId, paths: ["/v.mp4"] })
    await library.selectVideo(videoId)
    await library.setPlaybackPosition(12.4)
    await waitUntil(() => library.snapshot().caption?.segments.length === 2)
    const { createLibrary } = await import("../../src/library/index.js")
    const reopened = createLibrary({
      dataDir,
      modelStore,
      media,
      speechRecognizer: streamingRecognizer([]),
      embedder: silentEmbedder()
    })
    await reopened.selectVideo(videoId)
    expect(reopened.snapshot().videos[0]?.playbackPositionSeconds).toBe(12.4)
    expect(reopened.snapshot().caption?.segments).toHaveLength(2)
    const job = reopened.snapshot().jobs.find((item) => item.kind === "captioning")
    expect(job?.status).toBe("complete")
    expect(job?.progress).toBe(1)
  })

  test("a failed job keeps the Video and partial Caption, shows a readable error, and retries", async () => {
    const media = memoryMedia({ existing: ["/v.mp4"] })
    let fail = true
    const recognizer: SpeechRecognizer = {
      async caption(input) {
        if (fail) {
          await input.onSegment(SEGMENTS[0]!)
          throw new Error("ASR ran out of memory")
        }
        for (const segment of SEGMENTS) await input.onSegment(segment)
      }
    }
    const { library } = await unlockedLibrary({ media, speechRecognizer: recognizer })
    await library.createCourse("C")
    const sessionId = await library.createSession({ name: "S" })
    const [videoId] = await library.addVideos({ sessionId, paths: ["/v.mp4"] })
    await waitUntil(() =>
      library.snapshot().jobs.some((job) => job.kind === "captioning" && job.status === "failed")
    )
    expect(library.snapshot().videos[0]?.id).toBe(videoId)
    await library.selectVideo(videoId)
    expect(library.snapshot().caption?.segments).toHaveLength(1)
    const job = library.snapshot().jobs.find((item) => item.kind === "captioning")
    expect(job?.error).toBe("ASR ran out of memory")
    fail = false
    await library.retryJob(job!.id)
    await waitUntil(() =>
      library.snapshot().jobs.some((item) => item.kind === "captioning" && item.status === "complete")
    )
    expect(library.snapshot().caption?.segments.length).toBeGreaterThanOrEqual(1)
  })

  test("regenerate replaces an imported Caption using ASR", async () => {
    const media = memoryMedia({
      existing: ["/v.mp4"],
      sidecars: { "/v.mp4": "/v.srt" },
      files: { "/v.srt": SRT }
    })
    const { library } = await unlockedLibrary({
      media,
      speechRecognizer: streamingRecognizer(SEGMENTS)
    })
    await library.createCourse("C")
    const sessionId = await library.createSession({ name: "S" })
    const [videoId] = await library.addVideos({ sessionId, paths: ["/v.mp4"] })
    await library.selectVideo(videoId)
    expect(library.snapshot().caption?.source).toBe("imported")
    await library.regenerateCaption(videoId)
    await waitUntil(() => library.snapshot().caption?.source === "asr")
    expect(library.snapshot().caption?.segments[0]?.text).toBe("hello world")
  })

  test("Captioning does not start if the Spoken language ASR Model is not on disk", async () => {
    const calls: string[] = []
    const media = memoryMedia({ existing: ["/v.mp4"] })
    const { library, modelStore } = await unlockedLibrary({
      media,
      speechRecognizer: {
        async caption(input) {
          calls.push(input.modelId)
        }
      }
    })
    modelStore.markIncomplete(REQUIRED_MODELS.shenava)
    await library.createCourse("C")
    const sessionId = await library.createSession({ name: "S" })
    await library.addVideos({ sessionId, paths: ["/v.mp4"], spokenLanguage: "fa" })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(calls).toEqual([])
    const job = library.snapshot().jobs.find((item) => item.kind === "captioning")
    expect(job?.status).toBe("failed")
    expect(job?.error).toMatch(/ASR Model/i)
  })

  test("Persian Captioning uses Shenava and English never calls Shenava", async () => {
    const calls: string[] = []
    const recognizer: SpeechRecognizer = {
      async caption(input) {
        calls.push(input.modelId)
        await input.onSegment(SEGMENTS[0]!)
      }
    }
    const media = memoryMedia({ existing: ["/fa.mp4", "/en.mp4"] })
    const { library } = await unlockedLibrary({ media, speechRecognizer: recognizer })
    await library.createCourse("C")
    const sessionId = await library.createSession({ name: "S" })
    const [faId] = await library.addVideos({
      sessionId,
      paths: ["/fa.mp4"],
      spokenLanguage: "fa"
    })
    const [enId] = await library.addVideos({
      sessionId,
      paths: ["/en.mp4"],
      spokenLanguage: "en"
    })
    await waitUntil(() => calls.length >= 2)
    expect(calls).toContain(REQUIRED_MODELS.shenava)
    expect(calls).toContain(REQUIRED_MODELS.parakeet)
    await library.selectVideo(enId)
    expect(calls.filter((modelId) => modelId === REQUIRED_MODELS.shenava)).toHaveLength(1)
    await library.regenerateCaption(enId)
    await waitUntil(() => calls.length >= 3)
    expect(calls.filter((modelId) => modelId === REQUIRED_MODELS.shenava)).toHaveLength(1)
    expect(library.snapshot().videos.find((video) => video.id === faId)?.spokenLanguage).toBe("fa")
  })
})
