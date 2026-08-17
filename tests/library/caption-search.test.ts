import { describe, expect, test } from "vitest"
import { SRT } from "./fixtures.js"
import { memoryMedia, unlockedLibrary } from "./helpers.js"

async function libraryWithImportedCaption() {
  const media = memoryMedia({
    existing: ["/lesson.mp4", "/other.mp4"],
    sidecars: { "/lesson.mp4": "/lesson.srt" },
    files: { "/lesson.srt": SRT }
  })
  const { library } = await unlockedLibrary({ media })
  await library.createCourse("Course")
  const sessionId = await library.createSession({ name: "Day 1" })
  const [videoId, otherId] = await library.addVideos({
    sessionId,
    paths: ["/lesson.mp4", "/other.mp4"]
  })
  await library.selectVideo(videoId)
  return { library, videoId, otherId, sessionId }
}

describe("imported Caption and lexical Search", () => {
  test("a sidecar .srt becomes Caption and does not run ASR", async () => {
    const calls: string[] = []
    const media = memoryMedia({
      existing: ["/lesson.mp4"],
      sidecars: { "/lesson.mp4": "/lesson.srt" },
      files: { "/lesson.srt": SRT }
    })
    const { library } = await unlockedLibrary({
      media,
      speechRecognizer: {
        async caption(input) {
          calls.push(input.modelId)
        }
      }
    })
    await library.createCourse("Course")
    const sessionId = await library.createSession({ name: "S" })
    await library.addVideos({ sessionId, paths: ["/lesson.mp4"] })
    await library.selectVideo(library.snapshot().videos[0]!.id)
    const caption = library.snapshot().caption
    expect(caption?.source).toBe("imported")
    expect(caption?.segments[0]?.text).toBe("useEffect runs after paint")
    expect(caption?.segments[0]?.startSeconds).toBe(8)
    expect(calls).toEqual([])
  })

  test("Search in Video, Session, and Course returns lexical Hits", async () => {
    const { library, videoId } = await libraryWithImportedCaption()
    const videoHits = await library.search({ text: "useEffect", scope: "video" })
    expect(videoHits).toHaveLength(1)
    expect(videoHits[0]?.videoId).toBe(videoId)
    expect(videoHits[0]?.startSeconds).toBe(8)
    expect(videoHits[0]?.kind).toBe("caption")

    const sessionHits = await library.search({ text: "debounce", scope: "session" })
    expect(sessionHits[0]?.text).toMatch(/debounce/)

    const courseHits = await library.search({ text: "useEffect", scope: "course" })
    expect(courseHits).toHaveLength(1)
  })

  test("Search with no Video selected returns no Hits", async () => {
    const { library } = await unlockedLibrary()
    await library.createCourse("Course")
    expect(await library.search({ text: "useEffect", scope: "video" })).toEqual([])
    expect(await library.search({ text: "useEffect", scope: "session" })).toEqual([])
    expect(await library.search({ text: "useEffect", scope: "course" })).toEqual([])
  })

  test("Search without a Provider still returns Hits", async () => {
    const { library } = await libraryWithImportedCaption()
    expect(library.snapshot().providerConfigured).toBe(false)
    expect((await library.search({ text: "paint", scope: "video" })).length).toBeGreaterThan(0)
  })

  test("one active Caption per Video; Search reads Caption when Improved Caption is absent", async () => {
    const { library } = await libraryWithImportedCaption()
    expect(library.snapshot().improvedCaption).toBeNull()
    expect(library.snapshot().caption?.segments).toHaveLength(2)
    expect((await library.search({ text: "useEffect", scope: "video" }))[0]?.text).toContain("useEffect")
  })
})
