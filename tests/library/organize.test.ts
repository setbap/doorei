import { describe, expect, test } from "vitest"
import { memoryMedia, unlockedLibrary } from "./helpers.js"

describe("reorder, move, delete, and folder relink", () => {
  test("Sessions and Videos can be reordered", async () => {
    const media = memoryMedia({ existing: ["/a.mp4", "/b.mp4"] })
    const { library } = await unlockedLibrary({ media })
    await library.createCourse("C")
    const s1 = await library.createSession({ name: "First" })
    const s2 = await library.createSession({ name: "Second" })
    await library.reorderSessions([s2, s1])
    expect(library.snapshot().sessions.map((session) => session.name)).toEqual(["Second", "First"])

    const [a, b] = await library.addVideos({ sessionId: s1, paths: ["/a.mp4", "/b.mp4"] })
    await library.reorderVideos(s1, [b, a])
    expect(
      library.snapshot().videos.filter((video) => video.sessionId === s1).map((video) => video.id)
    ).toEqual([b, a])
  })

  test("moving a Video to another Session keeps Caption, Notes, and Playback Position", async () => {
    const media = memoryMedia({
      existing: ["/a.mp4"],
      sidecars: { "/a.mp4": "/a.srt" },
      files: {
        "/a.srt": `1\n00:00:01,000 --> 00:00:02,000\nhello\n`
      }
    })
    const { library } = await unlockedLibrary({ media })
    await library.createCourse("C")
    const s1 = await library.createSession({ name: "A" })
    const s2 = await library.createSession({ name: "B" })
    const [videoId] = await library.addVideos({ sessionId: s1, paths: ["/a.mp4"] })
    await library.selectVideo(videoId)
    await library.setPlaybackPosition(9)
    await library.addNote({ text: "keep me" })
    await library.moveVideo(videoId, s2)
    await library.selectVideo(videoId)
    expect(library.snapshot().videos[0]?.sessionId).toBe(s2)
    expect(library.snapshot().videos[0]?.playbackPositionSeconds).toBe(9)
    expect(library.snapshot().notes[0]?.text).toBe("keep me")
    expect(library.snapshot().caption?.segments[0]?.text).toBe("hello")
  })

  test("a Session can be renamed", async () => {
    const { library } = await unlockedLibrary()
    await library.createCourse("C")
    const sessionId = await library.createSession({ name: "Day 1" })
    await library.renameSession(sessionId, "Week 1")
    expect(library.snapshot().sessions[0]?.name).toBe("Week 1")
  })

  test("deleting an empty Session leaves the other Sessions", async () => {
    const { library } = await unlockedLibrary()
    await library.createCourse("C")
    const first = await library.createSession({ name: "First" })
    await library.createSession({ name: "Second" })
    await library.deleteSession(first)
    expect(library.snapshot().sessions.map((session) => session.name)).toEqual(["Second"])
  })

  test("deleting a Session deletes its Videos and Notes and leaves the rest of the Course", async () => {
    const media = memoryMedia({
      existing: ["/keep.mp4", "/drop.mp4"],
      sidecars: { "/drop.mp4": "/drop.srt" },
      files: {
        "/drop.srt": `1\n00:00:01,000 --> 00:00:02,000\ngone\n`
      }
    })
    const { library } = await unlockedLibrary({ media })
    await library.createCourse("C")
    const keepSession = await library.createSession({ name: "Keep" })
    const dropSession = await library.createSession({ name: "Drop" })
    const [keepId] = await library.addVideos({ sessionId: keepSession, paths: ["/keep.mp4"] })
    const [dropId] = await library.addVideos({ sessionId: dropSession, paths: ["/drop.mp4"] })
    await library.selectVideo(dropId)
    await library.addNote({ text: "will vanish" })
    await library.deleteSession(dropSession)
    const snap = library.snapshot()
    expect(snap.sessions.map((session) => session.name)).toEqual(["Keep"])
    expect(snap.videos.map((video) => video.id)).toEqual([keepId])
    expect(snap.notes).toEqual([])
    expect(snap.selectedVideoId).toBeNull()
    expect(snap.caption).toBeNull()
  })

  test("relinking a moved folder updates every Video under that prefix", async () => {
    const existing = new Set(["/old/day/a.mp4", "/old/day/b.mp4"])
    const media = {
      exists: (path: string) => existing.has(path),
      readText: () => {
        throw new Error("no")
      },
      captionSidecar: () => null
    }
    const { library } = await unlockedLibrary({ media })
    await library.createCourse("C")
    const sessionId = await library.createSession({ name: "S" })
    await library.addVideos({
      sessionId,
      paths: ["/old/day/a.mp4", "/old/day/b.mp4"]
    })
    existing.delete("/old/day/a.mp4")
    existing.delete("/old/day/b.mp4")
    existing.add("/new/day/a.mp4")
    existing.add("/new/day/b.mp4")
    await library.relinkFolder("/old/day", "/new/day")
    expect(library.snapshot().videos.map((video) => video.path)).toEqual([
      "/new/day/a.mp4",
      "/new/day/b.mp4"
    ])
    expect(library.snapshot().videos.every((video) => !video.fileMissing)).toBe(true)
  })
})
