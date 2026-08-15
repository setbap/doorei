import { describe, expect, test } from "vitest"
import { memoryMedia, unlockedLibrary } from "./helpers.js"

async function threeVideos() {
  const media = memoryMedia({
    existing: ["/a.mp4", "/b.mp4", "/c.mp4"]
  })
  const { library } = await unlockedLibrary({ media })
  await library.createCourse("Course")
  const session1 = await library.createSession({ name: "Day 1" })
  const session2 = await library.createSession({ name: "Day 2" })
  const [a, b] = await library.addVideos({ sessionId: session1, paths: ["/a.mp4", "/b.mp4"] })
  const [c] = await library.addVideos({ sessionId: session2, paths: ["/c.mp4"] })
  return { library, a, b, c }
}

describe("playback position, watched, and next Video", () => {
  test("reopening a Video resumes at Playback Position even when Watched is set", async () => {
    const { library, a } = await threeVideos()
    await library.selectVideo(a)
    await library.setPlaybackPosition(124)
    await library.setWatched(a, true)
    await library.selectVideo(a)
    const video = library.snapshot().videos.find((item) => item.id === a)
    expect(video?.playbackPositionSeconds).toBe(124)
    expect(video?.watched).toBe(true)
  })

  test("Watched can be set without finishing; reaching the end can auto-set Watched", async () => {
    const { library, a } = await threeVideos()
    await library.selectVideo(a)
    await library.setWatched(a, true)
    expect(library.snapshot().videos.find((item) => item.id === a)?.watched).toBe(true)

    const { library: other, a: otherA } = await threeVideos()
    await other.selectVideo(otherA)
    await other.markEnded()
    expect(other.snapshot().videos.find((item) => item.id === otherA)?.watched).toBe(true)

    await other.updateSettings({ autoMarkWatchedAtEnd: false })
    const { library: third, a: thirdA } = await threeVideos()
    await third.updateSettings({ autoMarkWatchedAtEnd: false })
    await third.selectVideo(thirdA)
    await third.markEnded()
    expect(third.snapshot().videos.find((item) => item.id === thirdA)?.watched).toBe(false)
  })

  test("after the last Video of a Session, next is the first Video of the next Session", async () => {
    const { library, a, b, c } = await threeVideos()
    await library.selectVideo(a)
    expect(library.nextVideoId()).toBe(b)
    await library.selectVideo(b)
    expect(library.nextVideoId()).toBe(c)
    await library.selectVideo(c)
    expect(library.nextVideoId()).toBeNull()
  })

  test("autoplay and confetti default off and speed is remembered", async () => {
    const { library } = await threeVideos()
    expect(library.snapshot().settings.autoplay).toBe(false)
    expect(library.snapshot().settings.confetti).toBe(false)
    expect(library.snapshot().settings.playbackSpeed).toBe(1)
    expect(library.snapshot().settings.captionColor).toBe("#ffffff")
    expect(library.snapshot().settings.captionBackground).toBe("#000000b8")
    await library.updateSettings({
      playbackSpeed: 1.5,
      subtitlesVisible: false,
      captionColor: "#facc15",
      captionBackground: "transparent"
    })
    expect(library.snapshot().settings.playbackSpeed).toBe(1.5)
    expect(library.snapshot().settings.subtitlesVisible).toBe(false)
    expect(library.snapshot().settings.captionColor).toBe("#facc15")
    expect(library.snapshot().settings.captionBackground).toBe("transparent")
  })

  test("Captioning job progress is never stored as Playback Position", async () => {
    const { library, a } = await threeVideos()
    await library.selectVideo(a)
    await library.setPlaybackPosition(40)
    const video = library.snapshot().videos.find((item) => item.id === a)
    expect(video?.playbackPositionSeconds).toBe(40)
    expect(video?.captioningProgress).not.toBe(40)
  })
})
