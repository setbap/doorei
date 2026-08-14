import { describe, expect, test } from "vitest"
import { SRT } from "./fixtures.js"
import { memoryMedia, unlockedLibrary } from "./helpers.js"

async function videoLibrary() {
  const media = memoryMedia({
    existing: ["/lesson.mp4"],
    sidecars: { "/lesson.mp4": "/lesson.srt" },
    files: { "/lesson.srt": SRT }
  })
  const { library } = await unlockedLibrary({ media })
  await library.createCourse("Course")
  const sessionId = await library.createSession({ name: "S" })
  const [videoId] = await library.addVideos({ sessionId, paths: ["/lesson.mp4"] })
  await library.selectVideo(videoId)
  return { library, videoId }
}

describe("Notes from the Composer", () => {
  test("a Note attaches to the current Video with an optional timestamp", async () => {
    const { library, videoId } = await videoLibrary()
    const noteId = await library.addNote({
      text: "this is the mental model I keep forgetting",
      timestampSeconds: 12.4
    })
    const notes = library.snapshot().notes
    expect(notes).toHaveLength(1)
    expect(notes[0]?.id).toBe(noteId)
    expect(notes[0]?.videoId).toBe(videoId)
    expect(notes[0]?.timestampSeconds).toBe(12.4)
  })

  test("Notes can be edited and Search finds them", async () => {
    const { library } = await videoLibrary()
    const noteId = await library.addNote({ text: "remember closures", timestampSeconds: 20 })
    await library.editNote(noteId, "remember closures and debounce")
    const hits = await library.search({ text: "debounce", scope: "video" })
    const noteHit = hits.find((hit) => hit.kind === "note")
    expect(noteHit?.text).toContain("debounce")
    expect(noteHit?.startSeconds).toBe(20)
  })

  test("deleting a Video deletes its Notes and never needs the media file", async () => {
    const { library, videoId } = await videoLibrary()
    await library.addNote({ text: "will vanish" })
    await library.deleteVideo(videoId)
    expect(library.snapshot().videos).toHaveLength(0)
    expect(library.snapshot().notes).toHaveLength(0)
    expect(library.snapshot().caption).toBeNull()
  })
})
