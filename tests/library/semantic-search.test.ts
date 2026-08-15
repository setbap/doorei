import { describe, expect, test } from "vitest"
import { SRT } from "./fixtures.js"
import { memoryMedia, unlockedLibrary, waitUntil } from "./helpers.js"

describe("semantic Search", () => {
  test("Search returns semantic Hits for paraphrases as well as lexical Hits", async () => {
    const embedder = {
      async embed(texts: string[]) {
        return texts.map((text) => {
          const lower = text.toLowerCase()
          if (lower.includes("useeffect") || lower.includes("after render")) return [1, 0]
          if (lower.includes("debounce")) return [0, 1]
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
    await library.createCourse("C")
    const sessionId = await library.createSession({ name: "S" })
    const [videoId] = await library.addVideos({ sessionId, paths: ["/lesson.mp4"] })
    await library.selectVideo(videoId)
    await waitUntil(
      () =>
        library.snapshot().jobs.some((job) => job.kind === "embed" && job.status === "complete"),
      3000
    )
    const lexical = await library.search({ text: "useEffect", scope: "video" })
    expect(lexical.some((hit) => hit.text.includes("useEffect"))).toBe(true)
    const semantic = await library.search({ text: "after render", scope: "video" })
    expect(semantic.some((hit) => hit.text.includes("useEffect"))).toBe(true)
    expect(library.snapshot().providerConfigured).toBe(false)
  })

  test("Search does not return a Note that only looks similar in embeddings", async () => {
    const embedder = {
      async embed(texts: string[]) {
        return texts.map(() => [1, 0])
      }
    }
    const media = memoryMedia({
      existing: ["/lesson.mp4"],
      sidecars: { "/lesson.mp4": "/lesson.srt" },
      files: { "/lesson.srt": SRT }
    })
    const { library } = await unlockedLibrary({ media, embedder })
    await library.createCourse("C")
    const sessionId = await library.createSession({ name: "S" })
    const [videoId] = await library.addVideos({ sessionId, paths: ["/lesson.mp4"] })
    await library.selectVideo(videoId)
    await waitUntil(
      () =>
        library.snapshot().jobs.some((job) => job.kind === "embed" && job.status === "complete"),
      3000
    )
    await library.addNote({ text: "buy milk after class", timestampSeconds: 4 })
    const embedJob = library.snapshot().jobs.find((job) => job.kind === "embed")
    expect(embedJob).toBeDefined()
    await library.retryJob(embedJob!.id)
    await waitUntil(
      () =>
        library.snapshot().jobs.some(
          (job) => job.kind === "embed" && job.status === "complete" && job.id === embedJob!.id
        ),
      3000
    )
    const hits = await library.search({ text: "useEffect", scope: "video" })
    expect(hits.some((hit) => hit.kind === "note")).toBe(false)
    expect(hits.some((hit) => hit.text.includes("useEffect"))).toBe(true)
  })
})
