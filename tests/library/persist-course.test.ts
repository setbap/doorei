import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { createLibrary } from "../../src/library/index.js"
import { SRT } from "./fixtures.js"
import {
  createTestLibrary,
  memoryMedia,
  silentEmbedder,
  silentRecognizer,
  unlockedLibrary,
  waitUntil
} from "./helpers.js"

const LEGACY_VIDEO = "vid_legacy"
const LEGACY_SESSION = "ses_legacy"
const LEGACY_COURSE = "crs_legacy"

function writeLegacyLibrary(dataDir: string): void {
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(
    join(dataDir, "library.json"),
    JSON.stringify({
      appLanguage: "fa",
      outputLanguage: "fa",
      provider: null,
      spokenLanguageDefault: "fa",
      settings: {},
      prompts: {},
      selectedCourseId: LEGACY_COURSE,
      selectedVideoId: LEGACY_VIDEO,
      activity: "summary",
      gatePassed: true,
      courses: [{ id: LEGACY_COURSE, name: "Legacy" }],
      sessions: [
        {
          id: LEGACY_SESSION,
          courseId: LEGACY_COURSE,
          name: "S",
          date: null,
          position: 0
        }
      ],
      videos: [
        {
          id: LEGACY_VIDEO,
          sessionId: LEGACY_SESSION,
          path: "/lesson.mp4",
          name: "lesson.mp4",
          position: 0,
          spokenLanguage: "en",
          playbackPositionSeconds: 12.4,
          watched: false,
          fileMissing: false,
          captioningProgress: 1,
          hasSummary: false
        }
      ],
      notes: [],
      captions: {
        [LEGACY_VIDEO]: {
          source: "imported",
          segments: [{ startSeconds: 8, endSeconds: 12.4, text: "useEffect runs after paint" }]
        }
      },
      improvedCaptions: {},
      summaries: {},
      embeddings: {},
      jobs: [],
      searchHits: [],
      askAnswer: null,
      lastAskError: null
    })
  )
}

describe("Library persistence", () => {
  test("a legacy JSON Library migrates and later JSON overwrites do not lose data", async () => {
    const { dataDir, modelStore } = createTestLibrary({ modelsComplete: true })
    writeLegacyLibrary(dataDir)
    const media = memoryMedia({
      existing: ["/lesson.mp4"],
      sidecars: { "/lesson.mp4": "/lesson.srt" },
      files: { "/lesson.srt": SRT }
    })
    const library = createLibrary({
      dataDir,
      modelStore,
      media,
      speechRecognizer: silentRecognizer(),
      embedder: silentEmbedder()
    })
    await library.selectVideo(LEGACY_VIDEO)
    expect(library.snapshot().videos[0]?.playbackPositionSeconds).toBe(12.4)
    const hits = await library.search({ text: "useEffect", scope: "video" })
    expect(hits[0]?.text).toContain("useEffect")
    await library.setPlaybackPosition(40)

    writeFileSync(join(dataDir, "library.json"), "{}")
    const reopened = createLibrary({
      dataDir,
      modelStore,
      media,
      speechRecognizer: silentRecognizer(),
      embedder: silentEmbedder()
    })
    await reopened.selectVideo(LEGACY_VIDEO)
    expect(reopened.snapshot().videos[0]?.playbackPositionSeconds).toBe(40)
    expect((await reopened.search({ text: "useEffect", scope: "video" }))[0]?.text).toContain(
      "useEffect"
    )
  })

  test("Search on one Course does not return Hits from another Course", async () => {
    const media = memoryMedia({
      existing: ["/a.mp4", "/b.mp4"],
      sidecars: { "/a.mp4": "/a.srt", "/b.mp4": "/b.srt" },
      files: {
        "/a.srt": `1\n00:00:01,000 --> 00:00:02,000\nhooks in Alpha\n`,
        "/b.srt": `1\n00:00:01,000 --> 00:00:02,000\nrouting in Beta\n`
      }
    })
    const { library, dataDir, modelStore } = await unlockedLibrary({ media })
    await library.createCourse("Alpha")
    const alphaSession = await library.createSession({ name: "A" })
    const [alphaId] = await library.addVideos({ sessionId: alphaSession, paths: ["/a.mp4"] })
    await library.createCourse("Beta")
    const betaSession = await library.createSession({ name: "B" })
    await library.addVideos({ sessionId: betaSession, paths: ["/b.mp4"] })
    await library.selectVideo(alphaId)
    const alphaHits = await library.search({ text: "hooks", scope: "course" })
    expect(alphaHits.some((hit) => hit.text.includes("hooks"))).toBe(true)
    expect(alphaHits.some((hit) => hit.text.includes("routing"))).toBe(false)

    const reopened = createLibrary({
      dataDir,
      modelStore,
      media,
      speechRecognizer: silentRecognizer(),
      embedder: silentEmbedder()
    })
    await reopened.selectVideo(alphaId)
    expect(
      (await reopened.search({ text: "hooks", scope: "course" })).some((hit) =>
        hit.text.includes("hooks")
      )
    ).toBe(true)
    const beta = reopened.snapshot().courses.find((course) => course.name === "Beta")
    await reopened.selectCourse(beta!.id)
    const betaVideo = reopened.snapshot().videos.find((video) => video.path === "/b.mp4")!
    await reopened.selectVideo(betaVideo.id)
    const betaHits = await reopened.search({ text: "routing", scope: "course" })
    expect(betaHits.some((hit) => hit.text.includes("routing"))).toBe(true)
    expect(betaHits.some((hit) => hit.text.includes("hooks"))).toBe(false)
  })

  test("deleting a Course drops its data and leaves the other Course searchable", async () => {
    const media = memoryMedia({
      existing: ["/a.mp4", "/b.mp4"],
      sidecars: { "/a.mp4": "/a.srt", "/b.mp4": "/b.srt" },
      files: {
        "/a.srt": `1\n00:00:01,000 --> 00:00:02,000\nalpha keep\n`,
        "/b.srt": `1\n00:00:01,000 --> 00:00:02,000\nbeta gone\n`
      }
    })
    const { library, dataDir, modelStore } = await unlockedLibrary({ media })
    await library.createCourse("Keep")
    const keepSession = await library.createSession({ name: "K" })
    const [keepId] = await library.addVideos({ sessionId: keepSession, paths: ["/a.mp4"] })
    const dropId = await library.createCourse("Drop")
    const dropSession = await library.createSession({ name: "D" })
    await library.addVideos({ sessionId: dropSession, paths: ["/b.mp4"] })
    await library.deleteCourse(dropId)
    expect(library.snapshot().courses.map((course) => course.name)).toEqual(["Keep"])
    await library.selectVideo(keepId)
    expect((await library.search({ text: "alpha", scope: "course" }))[0]?.text).toContain("alpha")

    const reopened = createLibrary({
      dataDir,
      modelStore,
      media,
      speechRecognizer: silentRecognizer(),
      embedder: silentEmbedder()
    })
    expect(reopened.snapshot().courses.map((course) => course.name)).toEqual(["Keep"])
    await reopened.selectVideo(keepId)
    expect((await reopened.search({ text: "alpha", scope: "course" }))[0]?.text).toContain("alpha")
    expect(
      (await reopened.search({ text: "beta", scope: "course" })).some((hit) => hit.text.includes("beta"))
    ).toBe(false)
  })

  test("Playback Position updates then reopen still Searches", async () => {
    const media = memoryMedia({
      existing: ["/lesson.mp4"],
      sidecars: { "/lesson.mp4": "/lesson.srt" },
      files: { "/lesson.srt": SRT }
    })
    const { library, dataDir, modelStore } = await unlockedLibrary({ media })
    await library.createCourse("C")
    const sessionId = await library.createSession({ name: "S" })
    const [videoId] = await library.addVideos({ sessionId, paths: ["/lesson.mp4"] })
    await library.selectVideo(videoId)
    await waitUntil(
      () =>
        library.snapshot().jobs.some((job) => job.kind === "embed" && job.status === "complete"),
      3000
    )
    await library.setPlaybackPosition(9)
    const reopened = createLibrary({
      dataDir,
      modelStore,
      media,
      speechRecognizer: silentRecognizer(),
      embedder: silentEmbedder()
    })
    await reopened.selectVideo(videoId)
    expect(reopened.snapshot().videos[0]?.playbackPositionSeconds).toBe(9)
    expect(reopened.snapshot().jobs.some((job) => job.videoId === videoId && job.kind === "embed")).toBe(
      true
    )
    expect((await reopened.search({ text: "useEffect", scope: "video" }))[0]?.startSeconds).toBe(8)
  })
})
