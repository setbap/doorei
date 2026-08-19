import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, test } from "vitest"
import { createProviderClient } from "../../src/adapters/provider.js"
import { createLibrary, type Library, type ProviderClient } from "../../src/library/index.js"
import { createNodeMedia } from "../../src/adapters/media.js"
import { MemoryModelStore, silentEmbedder, silentRecognizer, waitUntil } from "./helpers.js"

type Lesson = {
  file: string
  session: string
  caption: string
}

type Case = {
  id: string
  question: string
  select: string
  mentions?: { kind: "video" | "session"; name: string }[]
  expect: string[]
  avoid?: string[]
  note: string
}

const ROOT = join(tmpdir(), "doorei-ask-eval")
const MEDIA = join(ROOT, "media")
const DATA = join(ROOT, "library")

const LESSONS: Lesson[] = [
  {
    file: "boiling-point.mp4",
    session: "Heat",
    caption: `1
00:00:00,000 --> 00:00:04,000
Water boils at 100 degrees Celsius at sea level.

2
00:00:04,000 --> 00:00:08,000
Adding salt raises the boiling point of water.

3
00:00:08,000 --> 00:00:12,000
At high altitude the boiling point drops below 100 degrees.
`
  },
  {
    file: "conduction.mp4",
    session: "Heat",
    caption: `1
00:00:00,000 --> 00:00:04,000
Heat conduction moves energy through a still material.

2
00:00:04,000 --> 00:00:08,000
Copper conducts heat much better than wood.

3
00:00:08,000 --> 00:00:12,000
A metal pan handle gets hot by conduction from the burner.
`
  },
  {
    file: "convection.mp4",
    session: "Heat",
    caption: `1
00:00:00,000 --> 00:00:04,000
Convection is heat carried by a moving fluid.

2
00:00:04,000 --> 00:00:08,000
Boiling soup forms convection currents as hot liquid rises.

3
00:00:08,000 --> 00:00:12,000
Cooler soup sinks and the loop continues until it is uniform.
`
  },
  {
    file: "yeast.mp4",
    session: "Ingredients",
    caption: `1
00:00:00,000 --> 00:00:04,000
Baker's yeast eats sugar and releases carbon dioxide gas.

2
00:00:04,000 --> 00:00:08,000
That carbon dioxide is what makes bread dough rise.

3
00:00:08,000 --> 00:00:12,000
Yeast works best between 27 and 32 degrees Celsius.
`
  },
  {
    file: "emulsion.mp4",
    session: "Ingredients",
    caption: `1
00:00:00,000 --> 00:00:04,000
Mayonnaise is an emulsion of oil droplets in water.

2
00:00:04,000 --> 00:00:08,000
Egg yolk lecithin keeps the oil and water from separating.

3
00:00:08,000 --> 00:00:12,000
Whisk slowly at first so the emulsion does not break.
`
  },
  {
    file: "gluten.mp4",
    session: "Ingredients",
    caption: `1
00:00:00,000 --> 00:00:04,000
Kneading wheat dough develops a gluten network.

2
00:00:04,000 --> 00:00:08,000
Gluten traps the gas from yeast so the loaf holds its shape.

3
00:00:08,000 --> 00:00:12,000
Resting the dough lets gluten relax so it is easier to shape.
`
  },
  {
    file: "knife-safety.mp4",
    session: "Safety",
    caption: `1
00:00:00,000 --> 00:00:04,000
Use a claw grip so fingertips stay behind the knuckles.

2
00:00:04,000 --> 00:00:08,000
Always cut away from your body, never toward it.

3
00:00:08,000 --> 00:00:12,000
A dull knife is more dangerous because it slips instead of slicing.
`
  },
  {
    file: "cross-contamination.mp4",
    session: "Safety",
    caption: `1
00:00:00,000 --> 00:00:04,000
Keep raw chicken on the bottom shelf of the refrigerator.

2
00:00:04,000 --> 00:00:08,000
Use one cutting board for meat and a different board for vegetables.

3
00:00:08,000 --> 00:00:12,000
Wash the board with hot soapy water after raw meat, not a quick rinse.
`
  }
]

function cue(file: string): string {
  return join(MEDIA, file)
}

function writeVideo(file: string, caption: string): void {
  const videoPath = cue(file)
  const srtPath = videoPath.replace(/\.mp4$/, ".srt")
  execFileSync("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=320x180:d=4",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=44100:cl=mono",
    "-shortest",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "32k",
    videoPath
  ], { stdio: "ignore" })
  writeFileSync(srtPath, caption)
}

function score(answer: string, expected: string[], avoid: string[] = []): {
  status: "pass" | "partial" | "fail"
  hits: string[]
  missing: string[]
  leaks: string[]
} {
  const hay = answer.toLowerCase()
  const hits = expected.filter((item) => hay.includes(item.toLowerCase()))
  const missing = expected.filter((item) => !hay.includes(item.toLowerCase()))
  const leaks = avoid.filter((item) => hay.includes(item.toLowerCase()))
  if (hits.length === expected.length && leaks.length === 0) return { status: "pass", hits, missing, leaks }
  if (hits.length === 0) return { status: "fail", hits, missing, leaks }
  return { status: "partial", hits, missing, leaks }
}

async function main(): Promise<void> {
  const key = process.env.CURSOR_API_KEY?.trim()
  if (!key) throw new Error("CURSOR_API_KEY is missing")

  mkdirSync(MEDIA, { recursive: true })
  mkdirSync(DATA, { recursive: true })
  for (const lesson of LESSONS) writeVideo(lesson.file, lesson.caption)
  console.log(`wrote ${LESSONS.length} silent videos + sidecar Captions in ${MEDIA}`)

  let library: Library
  const inner = createProviderClient(() => library)
  const prompts: { system: string; prompt: string }[] = []
  const providerClient: ProviderClient = {
    async complete(input) {
      prompts.push(input)
      return inner.complete(input)
    }
  }
  const modelStore = new MemoryModelStore()
  modelStore.markAllRequired()
  library = createLibrary({
    dataDir: DATA,
    modelStore,
    media: createNodeMedia(),
    speechRecognizer: silentRecognizer(),
    embedder: silentEmbedder(),
    providerClient
  })
  await library.chooseAppLanguage("en")
  await library.configureProvider({ kind: "cursor", key, model: "composer-2.5", extra: '{"fast":true}' })
  await library.createCourse("Kitchen Science Lab", {
    outputLanguage: "en",
    spokenLanguageDefault: "en"
  })

  const sessionIds = new Map<string, string>()
  const videoIds = new Map<string, string>()
  for (const name of ["Heat", "Ingredients", "Safety"]) {
    sessionIds.set(name, await library.createSession({ name }))
  }
  for (const lesson of LESSONS) {
    const sessionId = sessionIds.get(lesson.session)!
    const [videoId] = await library.addVideos({
      sessionId,
      paths: [cue(lesson.file)],
      spokenLanguage: "en"
    })
    videoIds.set(lesson.file, videoId)
  }
  await waitUntil(
    () => library.snapshot().videos.every((video) => video.captioningProgress === null || video.captioningProgress === 1),
    8000
  )
  const snap = library.snapshot()
  console.log(
    `course ready: ${snap.sessions.length} Sessions, ${snap.videos.length} Videos, captions=${snap.videos.map((v) => v.name).join(", ")}`
  )

  const cases: Case[] = [
    {
      id: "boil-temp",
      question: "At what temperature does water boil at sea level?",
      select: "boiling-point.mp4",
      expect: ["100"],
      note: "selected Video, keyword overlap with Caption"
    },
    {
      id: "boil-salt",
      question: "What happens to the boiling point when you add salt?",
      select: "boiling-point.mp4",
      expect: ["rais"],
      note: "selected Video, salt / boiling point"
    },
    {
      id: "conduction-from-session",
      question: "Which conducts heat better, copper or wood?",
      select: "boiling-point.mp4",
      expect: ["copper"],
      note: "selected boiling Video; fact is in same Session"
    },
    {
      id: "yeast-from-course",
      question: "What gas does baker's yeast release that makes bread rise?",
      select: "boiling-point.mp4",
      expect: ["carbon dioxide"],
      note: "selected Heat Video; fact is in another Session"
    },
    {
      id: "paraphrase-no-keywords",
      question: "What is the key temperature number taught in this Video?",
      select: "boiling-point.mp4",
      expect: ["100"],
      note: "paraphrase with weak lexical overlap"
    },
    {
      id: "mention-yeast-gas",
      question: "What gas makes the dough rise?",
      select: "boiling-point.mp4",
      mentions: [{ kind: "video", name: "yeast.mp4" }],
      expect: ["carbon dioxide"],
      avoid: ["100 degrees"],
      note: "pin yeast while Heat Video is selected"
    },
    {
      id: "mention-conduction",
      question: "Does copper or wood move heat faster through a still pan?",
      select: "yeast.mp4",
      mentions: [{ kind: "video", name: "conduction.mp4" }],
      expect: ["copper"],
      note: "pin conduction while Ingredients Video is selected"
    },
    {
      id: "mention-heat-session",
      question: "Besides boiling, which two heat-moving processes are taught?",
      select: "yeast.mp4",
      mentions: [{ kind: "session", name: "Heat" }],
      expect: ["conduction", "convection"],
      note: "pin whole Heat Session"
    },
    {
      id: "mention-two-videos",
      question: "How do yeast and gluten work together in a loaf?",
      select: "knife-safety.mp4",
      mentions: [
        { kind: "video", name: "yeast.mp4" },
        { kind: "video", name: "gluten.mp4" }
      ],
      expect: ["carbon dioxide", "gluten"],
      note: "pin two Videos in one question"
    },
    {
      id: "mention-dull-knife",
      question: "Why can a blunt blade be worse than a sharp one?",
      select: "yeast.mp4",
      mentions: [{ kind: "video", name: "knife-safety.mp4" }],
      expect: ["slip"],
      note: "paraphrase about knife safety with mention"
    },
    {
      id: "mention-chicken-shelf",
      question: "Where in the fridge should raw poultry live?",
      select: "boiling-point.mp4",
      mentions: [{ kind: "video", name: "cross-contamination.mp4" }],
      expect: ["bottom"],
      note: "paraphrase, mention only"
    },
    {
      id: "mention-mayo",
      question: "What ingredient stops oil and water splitting in mayonnaise?",
      select: "boiling-point.mp4",
      mentions: [{ kind: "video", name: "emulsion.mp4" }],
      expect: ["lecithin"],
      note: "pin emulsion Video"
    },
    {
      id: "mention-yeast-range",
      question: "Which temperature range does the lecture recommend for yeast?",
      select: "boiling-point.mp4",
      mentions: [{ kind: "video", name: "yeast.mp4" }],
      expect: ["27"],
      note: "numeric fact from pinned Video"
    },
    {
      id: "mention-ingredients-session",
      question: "Name the three ingredient topics in this Session.",
      select: "knife-safety.mp4",
      mentions: [{ kind: "session", name: "Ingredients" }],
      expect: ["yeast", "emulsion", "gluten"],
      note: "pin Ingredients Session"
    },
    {
      id: "mention-claw-grip",
      question: "How should fingers be held while cutting?",
      select: "boiling-point.mp4",
      mentions: [{ kind: "video", name: "knife-safety.mp4" }],
      expect: ["claw"],
      note: "pin knife-safety"
    }
  ]

  const rows: Record<string, unknown>[] = []
  for (const item of cases) {
    const videoId = videoIds.get(item.select)
    if (!videoId) throw new Error(`missing ${item.select}`)
    await library.selectVideo(videoId)
    await library.createConversation()
    const mentions = (item.mentions ?? []).map((mention) => {
      if (mention.kind === "session") {
        const id = sessionIds.get(mention.name)
        if (!id) throw new Error(`missing session ${mention.name}`)
        return { kind: "session" as const, id }
      }
      const id = videoIds.get(mention.name)
      if (!id) throw new Error(`missing video ${mention.name}`)
      return { kind: "video" as const, id }
    })
    const started = Date.now()
    let answer = ""
    let error: string | null = null
    try {
      const result = await library.ask({ question: item.question, mentions })
      answer = result.text
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught)
    }
    const packed = prompts.at(-1)?.prompt
    let mentionHitCount = 0
    let videoHitCount = 0
    try {
      const parsed = packed ? (JSON.parse(packed) as { hits?: { mention?: unknown[]; video?: unknown[] } }) : null
      mentionHitCount = parsed?.hits?.mention?.length ?? 0
      videoHitCount = parsed?.hits?.video?.length ?? 0
    } catch {
      /* ignore */
    }
    const judged = error ? { status: "fail" as const, hits: [], missing: item.expect, leaks: [] } : score(answer, item.expect, item.avoid)
    const row = {
      id: item.id,
      note: item.note,
      question: item.question,
      select: item.select,
      mentions: item.mentions ?? [],
      status: judged.status,
      expectedHits: judged.hits,
      missing: judged.missing,
      leaks: judged.leaks,
      mentionHitCount,
      videoHitCount,
      ms: Date.now() - started,
      error,
      answer: answer.slice(0, 800)
    }
    rows.push(row)
    console.log(`${judged.status.toUpperCase()} ${item.id} (${row.ms}ms) missing=${judged.missing.join("|") || "-"}`)
    if (error) console.log(`  error: ${error}`)
    else console.log(`  answer: ${answer.slice(0, 180).replace(/\s+/g, " ")}`)
  }

  const summary = {
    pass: rows.filter((row) => row.status === "pass").length,
    partial: rows.filter((row) => row.status === "partial").length,
    fail: rows.filter((row) => row.status === "fail").length,
    total: rows.length
  }
  const report = { summary, rows }
  const out = join(ROOT, "report.json")
  writeFileSync(out, JSON.stringify(report, null, 2))
  writeFileSync("/opt/cursor/artifacts/ask_eval_report.json", JSON.stringify(report, null, 2))
  console.log(`\nsummary ${JSON.stringify(summary)}`)
  console.log(`wrote ${out}`)
}

const live = process.env.CURSOR_API_KEY ? describe : describe.skip

live("live Ask evaluation", () => {
  test("Cursor Provider answers Caption-backed questions", async () => {
    await main()
  }, 600_000)
})
