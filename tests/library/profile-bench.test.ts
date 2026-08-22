import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { performance } from "node:perf_hooks"
import { describe, expect, test } from "vitest"
import { createLibrary } from "../../src/library/index.js"
import { closeAllDbs } from "../../src/library/persist/index.js"
import { activeCaptionIndex } from "../../src/library/captionLookup.js"

const VIDEO_COUNT = 60
const SEGMENT_COUNT = 160

function clock(total: number): string {
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},000`
}

function srtFor(index: number): string {
  const chunks: string[] = []
  for (let s = 0; s < SEGMENT_COUNT; s += 1) {
    const start = s * 2
    const text =
      s % 19 === 0
        ? `useEffect runs after paint in lesson ${index + 1} clip ${s}`
        : `React hooks lesson ${index + 1} point ${s}`
    chunks.push(`${s + 1}\n${clock(start)} --> ${clock(start + 1)}\n${text}\n`)
  }
  return chunks.join("\n")
}

function avg(fn: () => void, repeats = 20): number {
  fn()
  const start = performance.now()
  for (let i = 0; i < repeats; i += 1) fn()
  return (performance.now() - start) / repeats
}

describe("Library profile bench", () => {
  test("keeps snapshot, playback, and Search cheap on a React-sized Course", async () => {
    const paths = Array.from(
      { length: VIDEO_COUNT },
      (_, i) => `/react/lesson-${String(i + 1).padStart(3, "0")}.mp4`
    )
    const sidecars: Record<string, string> = {}
    const files: Record<string, string> = {}
    for (const [index, path] of paths.entries()) {
      const srt = `${path}.srt`
      sidecars[path] = srt
      files[srt] = srtFor(index)
    }
    closeAllDbs()
    const dataDir = mkdtempSync(join(tmpdir(), "doorei-profile-"))
    const existing = new Set(paths)
    let existsCalls = 0
    const library = createLibrary({
      dataDir,
      modelStore: { isComplete: () => true },
      media: {
        exists: (path) => {
          existsCalls += 1
          return existing.has(path) || path in files || path in sidecars
        },
        readText: (path) => files[path] ?? "",
        captionSidecar: (videoPath) => sidecars[videoPath] ?? null
      },
      speechRecognizer: { async caption() {} },
      embedder: {
        async embed(texts) {
          return texts.map((text) => {
            const lower = text.toLowerCase()
            if (lower.includes("useeffect") || lower.includes("after render")) return [1, 0]
            return [0, 1]
          })
        }
      }
    })

    await library.chooseAppLanguage("en")
    await library.createCourse("React")
    const sessions: string[] = []
    for (const name of ["Hooks", "Effects", "Memo", "Context", "Suspense"]) {
      sessions.push(await library.createSession({ name }))
    }
    for (const [index, path] of paths.entries()) {
      await library.addVideos({
        sessionId: sessions[index % sessions.length]!,
        paths: [path],
        spokenLanguage: "en"
      })
    }
    await library.selectVideo(library.snapshot().videos[0]!.id)
    const jobWaitStart = performance.now()
    const deadline = Date.now() + 20_000
    while (
      library.snapshot().jobs.some((job) => job.status === "queued" || job.status === "running")
    ) {
      if (Date.now() > deadline) throw new Error("Jobs did not settle")
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    console.log(`PROFILE jobs_settle_ms=${(performance.now() - jobWaitStart).toFixed(1)}`)

    existsCalls = 0
    const snapshotMs = avg(() => {
      library.snapshot()
    })
    const existsPerSnapshot = existsCalls / 21
    console.log(`PROFILE snapshot_ms=${snapshotMs.toFixed(3)} exists_per_snapshot=${existsPerSnapshot.toFixed(1)}`)

    let notifies = 0
    library.subscribe(() => {
      notifies += 1
      library.snapshot()
    })
    existsCalls = 0
    notifies = 0
    const playbackStart = performance.now()
    for (let i = 0; i < 40; i += 1) await library.setPlaybackPosition(i)
    const playbackMs = performance.now() - playbackStart
    const playbackNotifies = notifies
    const playbackExists = existsCalls
    console.log(
      `PROFILE playback_40_ms=${playbackMs.toFixed(2)} playback_notifies=${playbackNotifies} playback_exists=${playbackExists}`
    )

    const selectedId = library.snapshot().videos[0]!.id
    existsCalls = 0
    notifies = 0
    await library.setWatched(selectedId, true)
    const watchedNotifies = notifies
    const watchedExists = existsCalls
    console.log(`PROFILE watched_notifies=${watchedNotifies} watched_exists=${watchedExists}`)

    const caption = library.snapshot().caption?.segments ?? []
    const binaryMs = avg(() => {
      activeCaptionIndex(caption, 180)
    }, 200)
    const linearMs = avg(() => {
      caption.findIndex((segment) => 180 >= segment.startSeconds && 180 <= segment.endSeconds)
    }, 200)
    console.log(`PROFILE caption_binary_ms=${binaryMs.toFixed(4)} caption_linear_ms=${linearMs.toFixed(4)}`)

    const lexicalStart = performance.now()
    const lexical = await library.search({ text: "useEffect", scope: "course" })
    const lexicalMs = performance.now() - lexicalStart
    const semanticStart = performance.now()
    const semantic = await library.search({ text: "after render", scope: "course" })
    const semanticMs = performance.now() - semanticStart
    console.log(
      `PROFILE lexical_ms=${lexicalMs.toFixed(2)} lexical_hits=${lexical.length} semantic_ms=${semanticMs.toFixed(2)} semantic_hits=${semantic.length}`
    )

    expect(library.snapshot().videos).toHaveLength(VIDEO_COUNT)
    expect(playbackNotifies).toBe(0)
    expect(playbackExists).toBe(0)
    expect(watchedExists).toBe(0)
    expect(watchedNotifies).toBe(1)
    expect(lexical.length).toBeGreaterThan(0)
    expect(semantic.length).toBeGreaterThan(0)
    expect(snapshotMs).toBeLessThan(50)
    expect(playbackMs).toBeLessThan(200)
  }, 60_000)
})
