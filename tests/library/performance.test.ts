import { describe, expect, test } from "vitest"
import { indexJobsByVideo } from "../../src/library/jobIndex.js"
import type { Job } from "../../src/library/types.js"
import { cosine, dot, l2Normalize } from "../../src/library/createLibrary/helpers.js"
import { SRT } from "./fixtures.js"
import { memoryMedia, silentEmbedder, unlockedLibrary, waitUntil } from "./helpers.js"
import type { CaptionSegment, SpeechRecognizer } from "../../src/library/index.js"
import { createLibrary } from "../../src/library/index.js"

function streamingRecognizer(segments: CaptionSegment[]): SpeechRecognizer {
  return {
    async caption(input) {
      for (let i = 0; i < 20; i += 1) await input.onProgress?.((i + 1) / 20)
      for (const segment of segments) await input.onSegment(segment)
    }
  }
}

describe("Library performance", () => {
  test("setPlaybackPosition persists without notifying subscribers", async () => {
    const media = memoryMedia({
      existing: ["/a.mp4"],
      sidecars: { "/a.mp4": "/a.srt" },
      files: { "/a.srt": "1\n00:00:00,000 --> 00:00:01,000\nhi\n" }
    })
    const { library, dataDir, modelStore } = await unlockedLibrary({ media })
    await library.createCourse("React")
    const sessionId = await library.createSession({ name: "S" })
    const [videoId] = await library.addVideos({ sessionId, paths: ["/a.mp4"] })
    await library.selectVideo(videoId)
    await waitUntil(
      () => !library.snapshot().jobs.some((job) => job.status === "queued" || job.status === "running")
    )
    let notifies = 0
    library.subscribe(() => {
      notifies += 1
    })
    await library.setPlaybackPosition(42)
    expect(notifies).toBe(0)
    expect(library.snapshot().videos[0]?.playbackPositionSeconds).toBe(42)

    const reopened = createLibrary({
      dataDir,
      modelStore,
      media,
      speechRecognizer: { async caption() {} },
      embedder: silentEmbedder()
    })
    expect(reopened.snapshot().videos[0]?.playbackPositionSeconds).toBe(42)
  })

  test("watched updates skip exists checks on notify snapshots", async () => {
    const existing = new Set(["/a.mp4"])
    let existsCalls = 0
    const media = {
      exists: (path: string) => {
        existsCalls += 1
        return existing.has(path)
      },
      readText: () => {
        throw new Error("no")
      },
      captionSidecar: () => null
    }
    const { library } = await unlockedLibrary({ media })
    await library.createCourse("React")
    const sessionId = await library.createSession({ name: "S" })
    const [videoId] = await library.addVideos({ sessionId, paths: ["/a.mp4"] })
    await library.selectVideo(videoId)
    await waitUntil(
      () => !library.snapshot().jobs.some((job) => job.status === "queued" || job.status === "running")
    )
    existsCalls = 0
    library.subscribe(() => {
      library.snapshot()
    })
    await library.setWatched(videoId, true)
    expect(existsCalls).toBe(0)
    existsCalls = 0
    library.snapshot()
    expect(existsCalls).toBeGreaterThan(0)
  })

  test("Captioning progress notifies the UI less often than ASR windows", async () => {
    const media = memoryMedia({ existing: ["/v.mp4"] })
    const { library } = await unlockedLibrary({
      media,
      speechRecognizer: streamingRecognizer([
        { startSeconds: 0, endSeconds: 1, text: "hello" }
      ])
    })
    await library.createCourse("React")
    const sessionId = await library.createSession({ name: "S" })
    let notifies = 0
    library.subscribe(() => {
      notifies += 1
    })
    await library.addVideos({ sessionId, paths: ["/v.mp4"] })
    await waitUntil(() =>
      library.snapshot().jobs.some((job) => job.kind === "captioning" && job.status === "complete")
    )
    expect(notifies).toBeLessThan(20)
  })

  test("job index groups failed, pipeline, and complete summary jobs per Video", () => {
    const jobs: Job[] = [
      {
        id: "1",
        kind: "captioning",
        videoId: "a",
        status: "failed",
        progress: 0.2,
        error: "ASR ran out of memory"
      },
      {
        id: "2",
        kind: "improve",
        videoId: "a",
        status: "running",
        progress: 0.5,
        error: null
      },
      {
        id: "3",
        kind: "summary",
        videoId: "b",
        status: "complete",
        progress: 1,
        error: null
      }
    ]
    const index = indexJobsByVideo(jobs)
    expect(index.get("a")?.failed).toHaveLength(1)
    expect(index.get("a")?.pipeline).toHaveLength(1)
    expect(index.get("b")?.hasCompleteSummary).toBe(true)
  })

  test("normalized vectors keep cosine as a dot product", () => {
    const a = l2Normalize([3, 4])
    const b = l2Normalize([6, 8])
    expect(dot(a, b)).toBeCloseTo(1)
    expect(cosine([3, 4], [6, 8])).toBeCloseTo(1)
  })

  test("Search still finds lexical and semantic Hits after vector normalization", async () => {
    const embedder = {
      async embed(texts: string[]) {
        return texts.map((text) => {
          const lower = text.toLowerCase()
          if (lower.includes("useeffect") || lower.includes("after render")) return [2, 0]
          return [0, 0]
        })
      }
    }
    const media = memoryMedia({
      existing: ["/lesson.mp4"],
      sidecars: { "/lesson.mp4": "/lesson.srt" },
      files: { "/lesson.srt": SRT }
    })
    const { library } = await unlockedLibrary({ media, embedder })
    await library.createCourse("React")
    const sessionId = await library.createSession({ name: "S" })
    const [videoId] = await library.addVideos({ sessionId, paths: ["/lesson.mp4"] })
    await library.selectVideo(videoId)
    await waitUntil(
      () => library.snapshot().jobs.some((job) => job.kind === "embed" && job.status === "complete"),
      3000
    )
    const lexical = await library.search({ text: "useEffect", scope: "video" })
    expect(lexical.some((hit) => hit.text.includes("useEffect"))).toBe(true)
    const semantic = await library.search({ text: "after render", scope: "video" })
    expect(semantic.some((hit) => hit.text.includes("useEffect"))).toBe(true)
  })
})
