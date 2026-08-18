import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { describe, expect, test } from "vitest"
import { createLibrary, DEFAULT_PROMPTS, type ProviderClient } from "../../src/library/index.js"
import { SRT } from "./fixtures.js"
import {
  createTestLibrary,
  memoryMedia,
  silentEmbedder,
  silentRecognizer,
  unlockedLibrary,
  waitUntil
} from "./helpers.js"

function recordingProvider(): {
  providerClient: ProviderClient
  prompts: { system: string; prompt: string }[]
} {
  const prompts: { system: string; prompt: string }[] = []
  const providerClient: ProviderClient = {
    async complete(input) {
      prompts.push(input)
      if (input.prompt.includes("JSON")) {
        return JSON.stringify(["useEffect runs after paint", "debounce the input"])
      }
      if (input.prompt.includes("Output language")) {
        return "Summary text"
      }
      return JSON.stringify({ text: "ok", hitIndexes: [0] })
    }
  }
  return { providerClient, prompts }
}

describe("Course prompts and languages", () => {
  test("creating a Course with only a name fills defaults from App language", async () => {
    const { library } = await unlockedLibrary()
    await library.createCourse("React")
    const course = library.snapshot().courses[0]!
    expect(course.name).toBe("React")
    expect(course.spokenLanguageDefault).toBe("fa")
    expect(course.outputLanguage).toBe("fa")
    expect(course.prompts).toEqual(DEFAULT_PROMPTS)
    expect(library.snapshot().outputLanguage).toBe("fa")
    expect(library.snapshot().prompts.ask).toBe(DEFAULT_PROMPTS.ask)
  })

  test("create and update reject a prompt shorter than 14 characters", async () => {
    const { library } = await unlockedLibrary()
    await expect(
      library.createCourse("C", { prompts: { summary: "too short" } })
    ).rejects.toThrow("Summary prompt must be 14 to 8000 characters")
    const id = await library.createCourse("C")
    await expect(
      library.updateCourse(id, { prompts: { ask: "tiny" } })
    ).rejects.toThrow("Ask prompt must be 14 to 8000 characters")
    expect(library.snapshot().prompts.ask).toBe(DEFAULT_PROMPTS.ask)
  })

  test("create rejects an empty Course name", async () => {
    const { library } = await unlockedLibrary()
    await expect(library.createCourse("   ")).rejects.toThrow(
      "Course name must be 1 to 120 characters"
    )
  })

  test("Ask and Summary use the Video's Course, not whichever Course is selected", async () => {
    const { providerClient, prompts } = recordingProvider()
    const media = memoryMedia({
      existing: ["/a.mp4", "/b.mp4"],
      sidecars: { "/a.mp4": "/a.srt", "/b.mp4": "/b.srt" },
      files: {
        "/a.srt": SRT,
        "/b.srt": SRT
      }
    })
    const { library } = await unlockedLibrary({ media, providerClient })
    await library.configureProvider({ kind: "openai", url: "http://x/v1" })
    const alphaId = await library.createCourse("Alpha", {
      outputLanguage: "en",
      prompts: { ask: "answer as Alpha helper", summary: "write Alpha summary now" }
    })
    const alphaSession = await library.createSession({ name: "A" })
    const [alphaVideo] = await library.addVideos({ sessionId: alphaSession, paths: ["/a.mp4"] })
    const betaId = await library.createCourse("Beta", {
      outputLanguage: "fa",
      prompts: { ask: "answer as Beta helper!!", summary: "write Beta summary now!" }
    })
    const betaSession = await library.createSession({ name: "B" })
    const [betaVideo] = await library.addVideos({ sessionId: betaSession, paths: ["/b.mp4"] })
    await library.selectVideo(alphaVideo)
    await waitUntil(
      () =>
        library.snapshot().jobs.some(
          (job) => job.videoId === alphaVideo && job.kind === "embed" && job.status === "complete"
        ),
      3000
    )
    await library.selectVideo(betaVideo)
    await waitUntil(
      () =>
        library.snapshot().jobs.some(
          (job) => job.videoId === betaVideo && job.kind === "embed" && job.status === "complete"
        ),
      3000
    )

    await library.selectCourse(alphaId)
    await library.selectVideo(alphaVideo)
    await library.ask({ question: "when does useEffect run?" })
    const alphaAsk = prompts.find((item) => item.system === "answer as Alpha helper")
    expect(alphaAsk).toBeTruthy()
    expect(JSON.parse(alphaAsk!.prompt).outputLanguage).toBe("en")

    prompts.length = 0
    await library.selectCourse(betaId)
    await library.selectVideo(betaVideo)
    await library.ask({ question: "when does useEffect run?" })
    const betaAsk = prompts.find((item) => item.system === "answer as Beta helper!!")
    expect(betaAsk).toBeTruthy()
    expect(JSON.parse(betaAsk!.prompt).outputLanguage).toBe("fa")

    prompts.length = 0
    await library.generateSummary(betaVideo)
    await library.selectCourse(alphaId)
    await waitUntil(
      () =>
        library.snapshot().jobs.some(
          (job) => job.videoId === betaVideo && job.kind === "summary" && job.status === "complete"
        ),
      3000
    )
    expect(prompts.some((item) => item.system === "write Beta summary now!")).toBe(true)
    expect(prompts.some((item) => item.prompt.startsWith("Output language: fa\n"))).toBe(true)
  })

  test("load copies app-wide prompts and languages onto existing Courses and drops those keys", async () => {
    const { dataDir, modelStore } = createTestLibrary({ modelsComplete: true })
    writeLegacyAppSqlite(dataDir, {
      outputLanguage: "en",
      spokenLanguageDefault: "fa",
      ask: "Answer only with Hits in English."
    })
    const library = createLibrary({
      dataDir,
      modelStore,
      media: memoryMedia(),
      speechRecognizer: silentRecognizer(),
      embedder: silentEmbedder()
    })
    const course = library.snapshot().courses[0]!
    expect(course.name).toBe("OWASP")
    expect(course.outputLanguage).toBe("en")
    expect(course.spokenLanguageDefault).toBe("fa")
    expect(course.prompts.ask).toBe("Answer only with Hits in English.")
    expect(course.prompts.improve).toBe(DEFAULT_PROMPTS.improve)

    const reopened = createLibrary({
      dataDir,
      modelStore,
      media: memoryMedia(),
      speechRecognizer: silentRecognizer(),
      embedder: silentEmbedder()
    })
    expect(reopened.snapshot().courses[0]?.outputLanguage).toBe("en")
    expect(reopened.snapshot().prompts.ask).toBe("Answer only with Hits in English.")
    expect(kvKeys(dataDir)).not.toContain("prompts")
    expect(kvKeys(dataDir)).not.toContain("outputLanguage")
    expect(kvKeys(dataDir)).not.toContain("spokenLanguageDefault")
  })
})

function writeLegacyAppSqlite(
  dataDir: string,
  input: { outputLanguage: string; spokenLanguageDefault: string; ask: string }
): void {
  mkdirSync(dataDir, { recursive: true })
  const db = new DatabaseSync(join(dataDir, "app.sqlite"))
  db.exec(`
    CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE courses (id TEXT PRIMARY KEY, name TEXT NOT NULL, position INTEGER NOT NULL);
  `)
  db.prepare("INSERT INTO courses(id, name, position) VALUES(?, ?, ?)").run("crs_legacy", "OWASP", 0)
  const kv = db.prepare("INSERT INTO kv(key, value) VALUES(?, ?)")
  kv.run("appLanguage", JSON.stringify("fa"))
  kv.run("outputLanguage", JSON.stringify(input.outputLanguage))
  kv.run("spokenLanguageDefault", JSON.stringify(input.spokenLanguageDefault))
  kv.run("prompts", JSON.stringify({ ask: input.ask }))
  kv.run("gatePassed", JSON.stringify(true))
  kv.run("selectedCourseId", JSON.stringify("crs_legacy"))
  db.close()
}

function kvKeys(dataDir: string): string[] {
  const db = new DatabaseSync(join(dataDir, "app.sqlite"))
  const rows = db.prepare("SELECT key FROM kv").all() as { key: string }[]
  db.close()
  return rows.map((row) => row.key)
}
