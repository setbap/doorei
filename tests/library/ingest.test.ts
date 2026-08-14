import { describe, expect, test } from "vitest"
import { memoryMedia, unlockedLibrary } from "./helpers.js"

describe("ingest and play", () => {
  test("creating a Course, Session, and Videos stores paths without copying media", async () => {
    const media = memoryMedia({
      existing: ["/courses/intro/01.mp4", "/courses/intro/02.mp4"]
    })
    const { library } = await unlockedLibrary({ media })

    const courseId = await library.createCourse("React")
    expect(library.snapshot().courses.map((course) => course.name)).toEqual(["React"])
    expect(library.snapshot().selectedCourseId).toBe(courseId)

    const sessionId = await library.createSession({ name: "Day 1", date: "2026-08-10" })
    const [firstId, secondId] = await library.addVideos({
      sessionId,
      paths: ["/courses/intro/01.mp4", "/courses/intro/02.mp4"]
    })

    const snap = library.snapshot()
    expect(snap.sessions[0]?.name).toBe("Day 1")
    expect(snap.sessions[0]?.date).toBe("2026-08-10")
    expect(snap.videos.map((video) => video.path)).toEqual([
      "/courses/intro/01.mp4",
      "/courses/intro/02.mp4"
    ])
    expect(snap.videos.map((video) => video.position)).toEqual([0, 1])
    expect(firstId).toBeTruthy()
    expect(secondId).toBeTruthy()
  })

  test("Spoken language defaults from App settings and English never selects Shenava", async () => {
    const media = memoryMedia({ existing: ["/en/a.mp4", "/fa/a.mp4"] })
    const { library } = await unlockedLibrary({ media })
    await library.createCourse("Mix")
    const sessionId = await library.createSession({ name: "Week 1" })

    const [persianId] = await library.addVideos({
      sessionId,
      paths: ["/fa/a.mp4"]
    })
    expect(library.snapshot().videos.find((video) => video.id === persianId)?.spokenLanguage).toBe(
      "fa"
    )

    await library.setSpokenLanguageDefault("en")
    const [englishId] = await library.addVideos({
      sessionId,
      paths: ["/en/a.mp4"]
    })
    expect(library.snapshot().videos.find((video) => video.id === englishId)?.spokenLanguage).toBe(
      "en"
    )
  })

  test("a missing file keeps the Video and can be relinked", async () => {
    const existing = new Set(["/old/lecture.mp4"])
    const media = {
      exists: (path: string) => existing.has(path),
      readText: () => {
        throw new Error("no text")
      },
      captionSidecar: () => null
    }
    const { library } = await unlockedLibrary({ media })
    await library.createCourse("Course")
    const sessionId = await library.createSession({ name: "S1" })
    const [videoId] = await library.addVideos({
      sessionId,
      paths: ["/old/lecture.mp4"]
    })

    existing.delete("/old/lecture.mp4")
    expect(library.snapshot().videos[0]?.fileMissing).toBe(true)
    expect(library.snapshot().videos[0]?.id).toBe(videoId)

    existing.add("/new/lecture.mp4")
    await library.relinkVideo(videoId, "/new/lecture.mp4")
    expect(library.snapshot().videos[0]?.path).toBe("/new/lecture.mp4")
    expect(library.snapshot().videos[0]?.fileMissing).toBe(false)
  })

  test("selecting a Video is enough to play; Captioning is not required", async () => {
    const media = memoryMedia({ existing: ["/v.mp4"] })
    const { library } = await unlockedLibrary({ media })
    await library.createCourse("C")
    const sessionId = await library.createSession({ name: "S" })
    const [videoId] = await library.addVideos({ sessionId, paths: ["/v.mp4"] })
    await library.selectVideo(videoId)
    const snap = library.snapshot()
    expect(snap.selectedVideoId).toBe(videoId)
    expect(snap.videos[0]?.fileMissing).toBe(false)
  })
})
