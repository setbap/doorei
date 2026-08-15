import { describe, expect, test } from "vitest"
import { applyTreeDrop, sessionRowPlacement, treeDropCommand, videoRowPlacement } from "../../src/library/treeDrop.js"
import { memoryMedia, unlockedLibrary } from "./helpers.js"

async function twoSessions() {
  const media = memoryMedia({ existing: ["/a.mp4", "/b.mp4"] })
  const { library } = await unlockedLibrary({ media })
  await library.createCourse("Course")
  const first = await library.createSession({ name: "First" })
  const second = await library.createSession({ name: "Second" })
  const [a] = await library.addVideos({ sessionId: first, paths: ["/a.mp4"] })
  const [b] = await library.addVideos({ sessionId: second, paths: ["/b.mp4"] })
  return { library, first, second, a, b }
}

describe("tree drop onto Sessions and Videos", () => {
  test("dragging a Session before another Session in the Course is the order the player chain uses", async () => {
    const { library, first, second, a, b } = await twoSessions()
    await library.selectVideo(a)
    expect(library.nextVideoId()).toBe(b)

    const command = treeDropCommand(library.snapshot(), { kind: "session", id: second }, {
      kind: "session",
      id: first,
      placement: "before"
    })
    expect(command).toEqual({ method: "reorderSessions", orderedIds: [second, first] })
    await applyTreeDrop(library, command!)

    expect(library.snapshot().sessions.map((session) => session.id)).toEqual([second, first])
    await library.selectVideo(b)
    expect(library.nextVideoId()).toBe(a)
    await library.selectVideo(a)
    expect(library.nextVideoId()).toBeNull()
  })

  test("dragging a Video before another Video in the Session is the order the player chain uses", async () => {
    const media = memoryMedia({ existing: ["/a.mp4", "/b.mp4"] })
    const { library } = await unlockedLibrary({ media })
    await library.createCourse("Course")
    const sessionId = await library.createSession({ name: "Day 1" })
    const [a, b] = await library.addVideos({ sessionId, paths: ["/a.mp4", "/b.mp4"] })
    await library.selectVideo(a)
    expect(library.nextVideoId()).toBe(b)

    const command = treeDropCommand(library.snapshot(), { kind: "video", id: b }, {
      kind: "video",
      id: a,
      placement: "before"
    })
    expect(command).toEqual({ method: "reorderVideos", sessionId, orderedIds: [b, a] })
    await applyTreeDrop(library, command!)

    expect(
      library.snapshot().videos.filter((video) => video.sessionId === sessionId).map((video) => video.id)
    ).toEqual([b, a])
    await library.selectVideo(b)
    expect(library.nextVideoId()).toBe(a)
  })

  test("dropping a Video onto another Session keeps Caption, Notes, and Playback Position", async () => {
    const media = memoryMedia({
      existing: ["/a.mp4"],
      sidecars: { "/a.mp4": "/a.srt" },
      files: { "/a.srt": `1\n00:00:01,000 --> 00:00:02,000\nhello\n` }
    })
    const { library } = await unlockedLibrary({ media })
    await library.createCourse("Course")
    const from = await library.createSession({ name: "From" })
    const to = await library.createSession({ name: "To" })
    const [videoId] = await library.addVideos({ sessionId: from, paths: ["/a.mp4"] })
    await library.selectVideo(videoId)
    await library.setPlaybackPosition(9)
    await library.addNote({ text: "keep me" })

    const command = treeDropCommand(library.snapshot(), { kind: "video", id: videoId }, {
      kind: "session",
      id: to,
      placement: "into"
    })
    expect(command).toEqual({ method: "moveVideo", videoId, toSessionId: to })
    await applyTreeDrop(library, command!)
    await library.selectVideo(videoId)

    expect(library.snapshot().videos.find((video) => video.id === videoId)?.sessionId).toBe(to)
    expect(library.snapshot().videos.find((video) => video.id === videoId)?.playbackPositionSeconds).toBe(9)
    expect(library.snapshot().notes[0]?.text).toBe("keep me")
    expect(library.snapshot().caption?.segments[0]?.text).toBe("hello")
  })

  test("dropping a Video onto another Course's Session keeps derived text with the Video", async () => {
    const media = memoryMedia({
      existing: ["/a.mp4"],
      sidecars: { "/a.mp4": "/a.srt" },
      files: { "/a.srt": `1\n00:00:01,000 --> 00:00:02,000\nhello\n` }
    })
    const { library } = await unlockedLibrary({ media })
    await library.createCourse("Alpha")
    const from = await library.createSession({ name: "From" })
    const [videoId] = await library.addVideos({ sessionId: from, paths: ["/a.mp4"] })
    await library.selectVideo(videoId)
    await library.setPlaybackPosition(4)
    await library.addNote({ text: "follow me" })
    const beta = await library.createCourse("Beta")
    const to = await library.createSession({ name: "To" })

    const snapshot = library.snapshot()
    expect(snapshot.sessions.some((session) => session.id === from)).toBe(true)
    expect(snapshot.sessions.some((session) => session.id === to)).toBe(true)
    expect(snapshot.videos.some((video) => video.id === videoId)).toBe(true)

    const command = treeDropCommand(snapshot, { kind: "video", id: videoId }, {
      kind: "session",
      id: to,
      placement: "into"
    })
    expect(command).toEqual({ method: "moveVideo", videoId, toSessionId: to })
    await applyTreeDrop(library, command!)
    await library.selectVideo(videoId)

    const moved = library.snapshot()
    expect(moved.selectedCourseId).toBe(beta)
    expect(moved.videos.find((video) => video.id === videoId)?.sessionId).toBe(to)
    expect(moved.videos.find((video) => video.id === videoId)?.playbackPositionSeconds).toBe(4)
    expect(moved.notes[0]?.text).toBe("follow me")
    expect(moved.caption?.segments[0]?.text).toBe("hello")
  })

  test("dropping a Video before a Video in another Session inserts it there", async () => {
    const media = memoryMedia({ existing: ["/a.mp4", "/b.mp4", "/c.mp4"] })
    const { library } = await unlockedLibrary({ media })
    await library.createCourse("Course")
    const from = await library.createSession({ name: "From" })
    const to = await library.createSession({ name: "To" })
    const [a] = await library.addVideos({ sessionId: from, paths: ["/a.mp4"] })
    const [b, c] = await library.addVideos({ sessionId: to, paths: ["/b.mp4", "/c.mp4"] })

    const command = treeDropCommand(library.snapshot(), { kind: "video", id: a }, {
      kind: "video",
      id: c,
      placement: "before"
    })
    expect(command).toEqual({
      method: "moveVideo",
      videoId: a,
      toSessionId: to,
      orderedIds: [b, a, c]
    })
    await applyTreeDrop(library, command!)

    expect(
      library.snapshot().videos.filter((video) => video.sessionId === to).map((video) => video.id)
    ).toEqual([b, a, c])
    await library.selectVideo(b)
    expect(library.nextVideoId()).toBe(a)
  })

  test("Sessions cannot nest or move to another Course", () => {
    const sessions = [
      { id: "s1", courseId: "c1" },
      { id: "s2", courseId: "c1" },
      { id: "s3", courseId: "c2" }
    ]
    const videos = [{ id: "v1", sessionId: "s1" }]
    const snapshot = { sessions, videos }
    expect(
      treeDropCommand(snapshot, { kind: "session", id: "s1" }, { kind: "session", id: "s2", placement: "into" })
    ).toBeNull()
    expect(
      treeDropCommand(snapshot, { kind: "session", id: "s1" }, { kind: "session", id: "s3", placement: "before" })
    ).toBeNull()
    expect(
      treeDropCommand(snapshot, { kind: "session", id: "s1" }, { kind: "video", id: "v1", placement: "before" })
    ).toBeNull()
  })

  test("row placement is vertical so RTL and LTR share the same drop edges", () => {
    expect(sessionRowPlacement(10, 100)).toBe("before")
    expect(sessionRowPlacement(50, 100)).toBe("into")
    expect(sessionRowPlacement(90, 100)).toBe("after")
    expect(videoRowPlacement(20, 100)).toBe("before")
    expect(videoRowPlacement(80, 100)).toBe("after")
  })
})
