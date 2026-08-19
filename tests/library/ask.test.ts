import { describe, expect, test } from "vitest"
import { createLibrary, type ProviderClient } from "../../src/library/index.js"
import { SRT } from "./fixtures.js"
import {
  memoryMedia,
  silentEmbedder,
  silentRecognizer,
  unlockedLibrary,
  waitUntil
} from "./helpers.js"

function recordingProvider(replies: string[] = []): {
  providerClient: ProviderClient
  prompts: { system: string; prompt: string }[]
} {
  const prompts: { system: string; prompt: string }[] = []
  const providerClient: ProviderClient = {
    async complete(input) {
      prompts.push(input)
      return (
        replies[prompts.length - 1] ??
        JSON.stringify({
          text: "useEffect اجرا می‌شود بعد از paint",
          hitIndexes: [0]
        })
      )
    }
  }
  return { providerClient, prompts }
}

async function courseWithLesson(providerClient: ProviderClient) {
  const media = memoryMedia({
    existing: ["/lesson.mp4"],
    sidecars: { "/lesson.mp4": "/lesson.srt" },
    files: { "/lesson.srt": SRT }
  })
  const ctx = await unlockedLibrary({ media, providerClient })
  await ctx.library.createCourse("C")
  const sessionId = await ctx.library.createSession({ name: "S" })
  const [videoId] = await ctx.library.addVideos({ sessionId, paths: ["/lesson.mp4"] })
  await ctx.library.selectVideo(videoId)
  await waitUntil(
    () => ctx.library.snapshot().jobs.some((job) => job.kind === "embed" && job.status === "complete"),
    3000
  )
  await ctx.library.configureProvider({ kind: "openai", url: "http://x/v1" })
  return { ...ctx, videoId, sessionId }
}

describe("Ask", () => {
  test("Ask is off when no Provider is configured", async () => {
    const { library } = await unlockedLibrary()
    await library.createCourse("C")
    expect(library.snapshot().askOff).toBe(true)
  })

  test("Search still returns Hits when Ask is off", async () => {
    const media = memoryMedia({
      existing: ["/lesson.mp4"],
      sidecars: { "/lesson.mp4": "/lesson.srt" },
      files: { "/lesson.srt": SRT }
    })
    const { library } = await unlockedLibrary({ media })
    await library.createCourse("C")
    const sessionId = await library.createSession({ name: "S" })
    await library.addVideos({ sessionId, paths: ["/lesson.mp4"] })
    await library.selectVideo(library.snapshot().videos[0]!.id)
    expect(library.snapshot().askOff).toBe(true)
    expect((await library.search({ text: "useEffect", scope: "video" }))[0]?.text).toContain(
      "useEffect"
    )
  })

  test("ask appends a user turn and an assistant turn to the Conversation", async () => {
    const { providerClient } = recordingProvider()
    const { library } = await courseWithLesson(providerClient)
    expect(library.snapshot().conversationTurns).toEqual([])
    const answer = await library.ask({ question: "when does useEffect run?" })
    const snap = library.snapshot()
    expect(snap.conversationTurns).toHaveLength(2)
    expect(snap.conversationTurns[0]).toMatchObject({
      kind: "user",
      text: "when does useEffect run?",
      hits: []
    })
    expect(snap.conversationTurns[1]?.kind).toBe("assistant")
    expect(snap.conversationTurns[1]?.text).toContain("useEffect")
    expect(snap.conversationTurns[1]?.hits[0]?.startSeconds).toBe(8)
    expect(answer.text).toContain("useEffect")
    expect(answer.hits[0]?.startSeconds).toBe(8)
    expect(snap.activeConversationId).toBeTruthy()
  })

  test("a follow-up sends prior turns plus newly retrieved Hits", async () => {
    const { providerClient, prompts } = recordingProvider([
      JSON.stringify({ text: "first", hitIndexes: [0] }),
      JSON.stringify({ text: "second", hitIndexes: [0] })
    ])
    const { library } = await courseWithLesson(providerClient)
    await library.ask({ question: "when does useEffect run?" })
    await library.ask({ question: "what about debounce?" })
    expect(library.snapshot().conversationTurns.map((turn) => turn.text)).toEqual([
      "when does useEffect run?",
      "first",
      "what about debounce?",
      "second"
    ])
    const packed = JSON.parse(prompts[1]!.prompt) as {
      history: { kind: string; text: string }[]
      question: string
      hits: { video: { text: string }[] }
    }
    expect(packed.question).toBe("what about debounce?")
    expect(packed.history).toEqual([
      { kind: "user", text: "when does useEffect run?" },
      { kind: "assistant", text: "first" }
    ])
    expect(packed.hits.video.some((hit) => hit.text.includes("debounce"))).toBe(true)
  })

  test("Provider complete receives the Ask prompt, Output language, current Video and Session, and labeled Hits", async () => {
    const { providerClient, prompts } = recordingProvider()
    const { library, videoId, sessionId } = await courseWithLesson(providerClient)
    await library.updateCourse(library.snapshot().selectedCourseId!, {
      prompts: { ask: "answer briefly" }
    })
    await library.ask({ question: "when does useEffect run?" })
    expect(prompts[0]?.system).toBe("answer briefly")
    const packed = JSON.parse(prompts[0]!.prompt) as {
      outputLanguage: string
      currentVideo: { id: string; name: string }
      currentSession: { id: string; name: string }
      hits: { video: { origin: string; text: string }[] }
      question: string
    }
    expect(packed.outputLanguage).toBe("fa")
    expect(packed.currentVideo.id).toBe(videoId)
    expect(packed.currentSession.id).toBe(sessionId)
    expect(packed.hits.video[0]?.origin).toBe("video")
    expect(packed.hits.video[0]?.text).toContain("useEffect")
    expect(packed.question).toBe("when does useEffect run?")
  })

  test("selecting a Video does not spawn a Conversation", async () => {
    const { providerClient } = recordingProvider()
    const { library } = await courseWithLesson(providerClient)
    expect(library.snapshot().conversations).toEqual([])
    expect(library.snapshot().activeConversationId).toBeNull()
    expect(library.snapshot().conversationTurns).toEqual([])
  })

  test("a Provider failure leaves earlier turns, sets a readable askError, and retry works", async () => {
    let fail = false
    const { providerClient, prompts } = recordingProvider()
    const original = providerClient.complete.bind(providerClient)
    providerClient.complete = async (input) => {
      if (fail) throw new Error("Provider refused")
      return original(input)
    }
    const { library } = await courseWithLesson(providerClient)
    await library.ask({ question: "when does useEffect run?" })
    fail = true
    await expect(library.ask({ question: "what about debounce?" })).rejects.toThrow("Provider refused")
    expect(library.snapshot().conversationTurns.map((turn) => turn.kind)).toEqual(["user", "assistant"])
    expect(library.snapshot().askError).toBe("Provider refused")
    fail = false
    await library.ask({ question: "what about debounce?" })
    expect(library.snapshot().askError).toBeNull()
    expect(library.snapshot().conversationTurns).toHaveLength(4)
    expect(library.snapshot().conversationTurns[3]?.text).toContain("useEffect")
    expect(prompts.length).toBe(2)
  })

  test("reopening the same data directory restores the Conversation", async () => {
    const { providerClient } = recordingProvider()
    const { library, dataDir, modelStore, videoId } = await courseWithLesson(providerClient)
    await library.ask({ question: "when does useEffect run?" })
    const conversationId = library.snapshot().activeConversationId
    const media = memoryMedia({
      existing: ["/lesson.mp4"],
      sidecars: { "/lesson.mp4": "/lesson.srt" },
      files: { "/lesson.srt": SRT }
    })
    const reopened = createLibrary({
      dataDir,
      modelStore,
      media,
      speechRecognizer: silentRecognizer(),
      embedder: silentEmbedder(),
      providerClient
    })
    await reopened.selectVideo(videoId)
    expect(reopened.snapshot().activeConversationId).toBe(conversationId)
    expect(reopened.snapshot().conversationTurns[0]?.text).toBe("when does useEffect run?")
    expect(reopened.snapshot().conversationTurns[1]?.hits[0]?.startSeconds).toBe(8)
  })
})

describe("Ask retrieval buckets", () => {
  test("Hits are labeled this Video, this Session, or rest of Course, and this Video follows selection", async () => {
    const { providerClient, prompts } = recordingProvider([
      JSON.stringify({ text: "about hooks", hitIndexes: [0] }),
      JSON.stringify({ text: "about routing", hitIndexes: [0] })
    ])
    const media = memoryMedia({
      existing: ["/a.mp4", "/b.mp4", "/c.mp4"],
      sidecars: { "/a.mp4": "/a.srt", "/b.mp4": "/b.srt", "/c.mp4": "/c.srt" },
      files: {
        "/a.srt": `1\n00:00:01,000 --> 00:00:02,000\nReact hooks run after paint\n`,
        "/b.srt": `1\n00:00:01,000 --> 00:00:02,000\nReact routing uses the router\n`,
        "/c.srt": `1\n00:00:01,000 --> 00:00:02,000\nReact redux holds state\n`
      }
    })
    const { library } = await unlockedLibrary({ media, providerClient })
    await library.createCourse("C")
    const week1 = await library.createSession({ name: "Week 1" })
    const week2 = await library.createSession({ name: "Week 2" })
    const [hooksId, routingId] = await library.addVideos({
      sessionId: week1,
      paths: ["/a.mp4", "/b.mp4"]
    })
    const [reduxId] = await library.addVideos({ sessionId: week2, paths: ["/c.mp4"] })
    await library.selectVideo(hooksId)
    await library.configureProvider({ kind: "openai", url: "http://x/v1" })
    await library.ask({ question: "React" })
    const first = JSON.parse(prompts[0]!.prompt) as {
      hits: {
        video: { text: string; origin: string; videoId: string }[]
        session: { text: string; origin: string; videoId: string }[]
        course: { text: string; origin: string; videoId: string }[]
      }
    }
    expect(first.hits.video.every((hit) => hit.videoId === hooksId && hit.origin === "video")).toBe(
      true
    )
    expect(first.hits.video.some((hit) => hit.text.includes("hooks"))).toBe(true)
    expect(first.hits.session.every((hit) => hit.videoId === routingId && hit.origin === "session")).toBe(
      true
    )
    expect(first.hits.session.some((hit) => hit.text.includes("routing"))).toBe(true)
    expect(first.hits.course.every((hit) => hit.videoId === reduxId && hit.origin === "course")).toBe(
      true
    )
    expect(first.hits.course.some((hit) => hit.text.includes("redux"))).toBe(true)

    await library.selectVideo(routingId)
    await library.ask({ question: "React" })
    expect(library.snapshot().conversationTurns).toHaveLength(4)
    const second = JSON.parse(prompts[1]!.prompt) as {
      hits: { video: { videoId: string; origin: string; text: string }[] }
    }
    expect(second.hits.video.every((hit) => hit.videoId === routingId)).toBe(true)
    expect(second.hits.video.some((hit) => hit.text.includes("routing"))).toBe(true)
    expect(library.snapshot().conversationTurns[1]?.hits[0]?.text).toContain("hooks")
  })
})

describe("several Conversations per Course", () => {
  test("a second Conversation on the same Course does not contain the first's turns", async () => {
    const { providerClient } = recordingProvider([
      JSON.stringify({ text: "hooks answer", hitIndexes: [] }),
      JSON.stringify({ text: "routing answer", hitIndexes: [] })
    ])
    const { library } = await courseWithLesson(providerClient)
    await library.ask({ question: "tell me about hooks" })
    const firstId = library.snapshot().activeConversationId
    const secondId = await library.createConversation()
    expect(secondId).not.toBe(firstId)
    expect(library.snapshot().activeConversationId).toBe(secondId)
    expect(library.snapshot().conversationTurns).toEqual([])
    await library.ask({ question: "tell me about routing" })
    expect(library.snapshot().conversationTurns.map((turn) => turn.text)).toEqual([
      "tell me about routing",
      "routing answer"
    ])
    await library.selectConversation(firstId!)
    expect(library.snapshot().conversationTurns.map((turn) => turn.text)).toEqual([
      "tell me about hooks",
      "hooks answer"
    ])
  })

  test("title starts as a truncation of the first question and rename persists", async () => {
    const { providerClient } = recordingProvider()
    const { library } = await courseWithLesson(providerClient)
    const long = "when does useEffect run after paint in this React lecture about hooks and routing together?"
    await library.ask({ question: long })
    expect(library.snapshot().conversations[0]?.title).toBe(long.slice(0, 80))
    const id = library.snapshot().activeConversationId!
    await library.renameConversation(id, "Hooks")
    expect(library.snapshot().conversations[0]?.title).toBe("Hooks")
  })

  test("last used Conversation is restored after reopen and after switching Course", async () => {
    const { providerClient } = recordingProvider([
      JSON.stringify({ text: "a1", hitIndexes: [] }),
      JSON.stringify({ text: "b1", hitIndexes: [] }),
      JSON.stringify({ text: "a2", hitIndexes: [] })
    ])
    const { library, dataDir, modelStore, videoId } = await courseWithLesson(providerClient)
    await library.ask({ question: "alpha one" })
    const alphaFirst = library.snapshot().activeConversationId!
    await library.createConversation()
    await library.ask({ question: "alpha two" })
    const alphaSecond = library.snapshot().activeConversationId!
    const betaId = await library.createCourse("Beta")
    const betaSession = await library.createSession({ name: "B" })
    await library.addVideos({ sessionId: betaSession, paths: ["/lesson.mp4"] })
    await library.ask({ question: "beta one" })
    expect(library.snapshot().conversations.map((item) => item.title)).toEqual(["beta one"])
    await library.selectCourse(library.snapshot().courses[0]!.id)
    await library.selectVideo(videoId)
    expect(library.snapshot().activeConversationId).toBe(alphaSecond)
    expect(library.snapshot().conversations.map((item) => item.title).sort()).toEqual([
      "alpha one",
      "alpha two"
    ])

    const media = memoryMedia({
      existing: ["/lesson.mp4"],
      sidecars: { "/lesson.mp4": "/lesson.srt" },
      files: { "/lesson.srt": SRT }
    })
    const reopened = createLibrary({
      dataDir,
      modelStore,
      media,
      speechRecognizer: silentRecognizer(),
      embedder: silentEmbedder(),
      providerClient
    })
    await reopened.selectVideo(videoId)
    expect(reopened.snapshot().activeConversationId).toBe(alphaSecond)
    await reopened.selectCourse(betaId)
    expect(reopened.snapshot().conversations.map((item) => item.title)).toEqual(["beta one"])
    expect(reopened.snapshot().conversationTurns[0]?.text).toBe("beta one")
    expect(alphaFirst).not.toBe(alphaSecond)
  })

  test("deleting a Course deletes its Conversations", async () => {
    const { providerClient } = recordingProvider()
    const { library } = await courseWithLesson(providerClient)
    await library.ask({ question: "keep this?" })
    const dropId = await library.createCourse("Drop")
    await library.createSession({ name: "D" })
    await library.ask({ question: "gone" })
    await library.deleteCourse(dropId)
    expect(library.snapshot().conversations.map((item) => item.title)).toEqual(["keep this?"])
  })

  test("deleting a Conversation removes it and leaves the other", async () => {
    const { providerClient } = recordingProvider([
      JSON.stringify({ text: "one", hitIndexes: [] }),
      JSON.stringify({ text: "two", hitIndexes: [] })
    ])
    const { library } = await courseWithLesson(providerClient)
    await library.ask({ question: "first" })
    const first = library.snapshot().activeConversationId!
    await library.createConversation()
    await library.ask({ question: "second" })
    const second = library.snapshot().activeConversationId!
    await library.deleteConversation(second)
    expect(library.snapshot().activeConversationId).toBe(first)
    expect(library.snapshot().conversations.map((item) => item.title)).toEqual(["first"])
  })
})

function manyCues(word: string, count: number): string {
  return Array.from({ length: count }, (_, i) => {
    const minutes = Math.floor(i / 60)
    const seconds = i % 60
    const start = `00:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},000`
    const end = `00:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},400`
    return `${i + 1}\n${start} --> ${end}\n${word} cue ${i}\n`
  }).join("\n")
}

describe("Ask context budget", () => {
  test("Ask keeps at most 8 this-Video Hits, 6 more from this Session, and 6 from the rest of the Course", async () => {
    const { providerClient, prompts } = recordingProvider()
    const media = memoryMedia({
      existing: ["/a.mp4", "/b.mp4", "/c.mp4"],
      sidecars: { "/a.mp4": "/a.srt", "/b.mp4": "/b.srt", "/c.mp4": "/c.srt" },
      files: {
        "/a.srt": manyCues("React", 12),
        "/b.srt": manyCues("React", 12),
        "/c.srt": manyCues("React", 12)
      }
    })
    const { library } = await unlockedLibrary({ media, providerClient })
    await library.createCourse("C")
    const week1 = await library.createSession({ name: "Week 1" })
    const week2 = await library.createSession({ name: "Week 2" })
    const [hooksId] = await library.addVideos({ sessionId: week1, paths: ["/a.mp4", "/b.mp4"] })
    await library.addVideos({ sessionId: week2, paths: ["/c.mp4"] })
    await library.selectVideo(hooksId)
    await library.configureProvider({ kind: "openai", url: "http://x/v1" })
    await library.ask({ question: "React" })
    const packed = JSON.parse(prompts[0]!.prompt) as {
      hits: { video: unknown[]; session: unknown[]; course: unknown[] }
    }
    expect(packed.hits.video).toHaveLength(8)
    expect(packed.hits.session).toHaveLength(6)
    expect(packed.hits.course).toHaveLength(6)
  })

  test("Ask context budget defaults to 24000 tokens", async () => {
    const { library } = await unlockedLibrary()
    expect(library.snapshot().settings.askContextBudgetTokens).toBe(24_000)
  })

  test("current Video Summary is packed when it exists, otherwise Ask says it is missing", async () => {
    const asks: unknown[] = []
    const providerClient: ProviderClient = {
      async complete({ system, prompt }) {
        try {
          const packed = JSON.parse(prompt) as { question?: string }
          if (packed.question) {
            asks.push(packed)
            return JSON.stringify({ text: "ok", hitIndexes: [0] })
          }
        } catch {
          /* not Ask */
        }
        if (system.includes("corrected wording")) return JSON.stringify(["useEffect runs after paint", "debounce the input"])
        return "hooks overview"
      }
    }
    const { library, videoId } = await courseWithLesson(providerClient)
    await library.ask({ question: "when does useEffect run?" })
    const missing = asks[0] as { currentVideoSummary: string | null; currentVideoSummaryMissing: boolean }
    expect(missing.currentVideoSummary).toBeNull()
    expect(missing.currentVideoSummaryMissing).toBe(true)
    await library.generateSummary(videoId)
    await waitUntil(() => library.snapshot().summary !== null, 3000)
    await library.ask({ question: "what is in this Video?" })
    const packed = asks[1] as { currentVideoSummary: string | null; currentVideoSummaryMissing: boolean }
    expect(packed.currentVideoSummary).toBe("hooks overview")
    expect(packed.currentVideoSummaryMissing).toBe(false)
  })

  test("other Session Summaries appear only when a kept Hit is from another Video in this Session", async () => {
    const asks: {
      sessionSummaries: { videoId: string; text: string }[]
      currentVideoSummary: string | null
    }[] = []
    const providerClient: ProviderClient = {
      async complete({ system, prompt }) {
        try {
          const packed = JSON.parse(prompt) as {
            question?: string
            sessionSummaries?: { videoId: string; text: string }[]
            currentVideoSummary?: string | null
          }
          if (packed.question) {
            asks.push({
              sessionSummaries: packed.sessionSummaries ?? [],
              currentVideoSummary: packed.currentVideoSummary ?? null
            })
            return JSON.stringify({ text: "ok", hitIndexes: [0] })
          }
        } catch {
          /* not Ask */
        }
        if (system.includes("corrected wording")) {
          const start = prompt.indexOf("[")
          const end = prompt.lastIndexOf("]")
          if (start >= 0 && end > start) return prompt.slice(start, end + 1)
          return JSON.stringify(["line"])
        }
        if (prompt.includes("hooks")) return "hooks overview"
        if (prompt.includes("routing")) return "routing overview"
        if (prompt.includes("redux")) return "redux overview"
        return "overview"
      }
    }
    const media = memoryMedia({
      existing: ["/a.mp4", "/b.mp4", "/c.mp4"],
      sidecars: { "/a.mp4": "/a.srt", "/b.mp4": "/b.srt", "/c.mp4": "/c.srt" },
      files: {
        "/a.srt": `1\n00:00:01,000 --> 00:00:02,000\nReact hooks run after paint\n`,
        "/b.srt": `1\n00:00:01,000 --> 00:00:02,000\nReact routing uses the router\n`,
        "/c.srt": `1\n00:00:01,000 --> 00:00:02,000\nReact redux holds state\n`
      }
    })
    const { library } = await unlockedLibrary({ media, providerClient })
    await library.createCourse("C")
    const week1 = await library.createSession({ name: "Week 1" })
    const week2 = await library.createSession({ name: "Week 2" })
    const [hooksId, routingId] = await library.addVideos({
      sessionId: week1,
      paths: ["/a.mp4", "/b.mp4"]
    })
    const [reduxId] = await library.addVideos({ sessionId: week2, paths: ["/c.mp4"] })
    await library.configureProvider({ kind: "openai", url: "http://x/v1" })
    await library.selectVideo(hooksId)
    await library.generateSummary(hooksId)
    await library.selectVideo(routingId)
    await library.generateSummary(routingId)
    await library.selectVideo(reduxId)
    await library.generateSummary(reduxId)
    await waitUntil(() => library.snapshot().videos.every((video) => video.hasSummary), 4000)
    await library.selectVideo(hooksId)
    await library.ask({ question: "React" })
    expect(asks[0]?.currentVideoSummary).toBe("hooks overview")
    expect(asks[0]?.sessionSummaries.map((item) => item.text)).toEqual(["routing overview"])
    expect(asks[0]?.sessionSummaries.some((item) => item.videoId === reduxId)).toBe(false)

    await library.ask({ question: "hooks paint" })
    expect(asks[1]?.sessionSummaries).toEqual([])
  })

  test("when the packed prompt exceeds the budget, older turns become a visible compact turn", async () => {
    const { providerClient, prompts } = recordingProvider([
      JSON.stringify({ text: "first answer", hitIndexes: [0] }),
      JSON.stringify({ text: "second answer", hitIndexes: [0] })
    ])
    const original = providerClient.complete.bind(providerClient)
    providerClient.complete = async (input) => {
      if (input.system.includes("Compact")) return "earlier facts about useEffect"
      return original(input)
    }
    const { library } = await courseWithLesson(providerClient)
    await library.updateSettings({ askContextBudgetTokens: 80 })
    await library.ask({ question: "when does useEffect run?" })
    await library.ask({ question: "what about debounce?" })
    const kinds = library.snapshot().conversationTurns.map((turn) => turn.kind)
    expect(kinds[0]).toBe("compact")
    expect(library.snapshot().conversationTurns[0]?.text).toContain("useEffect")
    expect(library.snapshot().conversationTurns[0]?.hits[0]?.startSeconds).toBe(8)
    const askPrompt = prompts.filter((item) => {
      try {
        return "question" in JSON.parse(item.prompt)
      } catch {
        return false
      }
    })[1]
    const packed = JSON.parse(askPrompt!.prompt) as {
      history: { kind: string; text: string }[]
      question: string
      hits: { video: unknown[] }
    }
    expect(packed.question).toBe("what about debounce?")
    expect(packed.hits.video.length).toBeGreaterThan(0)
    expect(packed.history.some((turn) => turn.text === "when does useEffect run?")).toBe(false)
  })
})

describe("Ask mentions", () => {
  test("mentioning Videos packs those Captions even when another Video is selected", async () => {
    const { providerClient, prompts } = recordingProvider()
    const media = memoryMedia({
      existing: ["/a.mp4", "/b.mp4", "/c.mp4"],
      sidecars: { "/a.mp4": "/a.srt", "/b.mp4": "/b.srt", "/c.mp4": "/c.srt" },
      files: {
        "/a.srt": `1\n00:00:01,000 --> 00:00:02,000\nReact hooks run after paint\n`,
        "/b.srt": `1\n00:00:01,000 --> 00:00:02,000\nReact routing uses the router\n`,
        "/c.srt": `1\n00:00:01,000 --> 00:00:02,000\nReact redux holds state\n`
      }
    })
    const { library } = await unlockedLibrary({ media, providerClient })
    await library.createCourse("C")
    const week1 = await library.createSession({ name: "Week 1" })
    const week2 = await library.createSession({ name: "Week 2" })
    const [hooksId, routingId] = await library.addVideos({
      sessionId: week1,
      paths: ["/a.mp4", "/b.mp4"]
    })
    const [reduxId] = await library.addVideos({ sessionId: week2, paths: ["/c.mp4"] })
    await library.selectVideo(hooksId)
    await library.configureProvider({ kind: "openai", url: "http://x/v1" })
    await library.ask({
      question: "what does routing use?",
      mentions: [{ kind: "video", id: routingId }]
    })
    const packed = JSON.parse(prompts[0]!.prompt) as {
      question: string
      mentions: { kind: string; id: string; name: string }[]
      hits: {
        video: unknown[]
        session: unknown[]
        course: unknown[]
        mention: { videoId: string; origin: string; text: string }[]
      }
    }
    expect(packed.question).toBe("what does routing use?")
    expect(packed.mentions).toEqual([
      { kind: "video", id: routingId, name: "b.mp4", path: "Week 1" }
    ])
    expect(packed.hits.video).toEqual([])
    expect(packed.hits.mention.every((hit) => hit.videoId === routingId)).toBe(true)
    expect(packed.hits.mention.every((hit) => hit.origin === "mention")).toBe(true)
    expect(packed.hits.mention.some((hit) => hit.text.includes("routing"))).toBe(true)
    expect(packed.hits.mention.some((hit) => hit.videoId === reduxId)).toBe(false)
    expect(library.snapshot().conversationTurns[0]?.text).toBe("@b.mp4 what does routing use?")
  })

  test("mentioning a Session includes every Video in that Session", async () => {
    const { providerClient, prompts } = recordingProvider()
    const media = memoryMedia({
      existing: ["/a.mp4", "/b.mp4", "/c.mp4"],
      sidecars: { "/a.mp4": "/a.srt", "/b.mp4": "/b.srt", "/c.mp4": "/c.srt" },
      files: {
        "/a.srt": `1\n00:00:01,000 --> 00:00:02,000\nReact hooks run after paint\n`,
        "/b.srt": `1\n00:00:01,000 --> 00:00:02,000\nReact routing uses the router\n`,
        "/c.srt": `1\n00:00:01,000 --> 00:00:02,000\nReact redux holds state\n`
      }
    })
    const { library } = await unlockedLibrary({ media, providerClient })
    await library.createCourse("C")
    const week1 = await library.createSession({ name: "Week 1" })
    const week2 = await library.createSession({ name: "Week 2" })
    const [hooksId] = await library.addVideos({ sessionId: week1, paths: ["/a.mp4", "/b.mp4"] })
    const [reduxId] = await library.addVideos({ sessionId: week2, paths: ["/c.mp4"] })
    await library.selectVideo(reduxId)
    await library.configureProvider({ kind: "openai", url: "http://x/v1" })
    await library.ask({
      question: "what is covered here?",
      mentions: [{ kind: "session", id: week1 }]
    })
    const packed = JSON.parse(prompts[0]!.prompt) as {
      mentions: { kind: string; name: string }[]
      hits: { mention: { videoId: string; text: string }[] }
    }
    expect(packed.mentions).toEqual([{ kind: "session", id: week1, name: "Week 1", path: "" }])
    const mentionedIds = new Set(packed.hits.mention.map((hit) => hit.videoId))
    expect(mentionedIds.has(hooksId)).toBe(true)
    expect(mentionedIds.has(reduxId)).toBe(false)
    expect(packed.hits.mention.some((hit) => hit.text.includes("hooks"))).toBe(true)
    expect(packed.hits.mention.some((hit) => hit.text.includes("routing"))).toBe(true)
  })

  test("a question that does not match Caption words still attaches mentioned Caption segments", async () => {
    const { providerClient, prompts } = recordingProvider()
    const { library } = await courseWithLesson(providerClient)
    const videoId = library.snapshot().selectedVideoId!
    await library.ask({
      question: "what is the key insight?",
      mentions: [{ kind: "video", id: videoId }]
    })
    const packed = JSON.parse(prompts[0]!.prompt) as {
      hits: { mention: { text: string; origin: string }[] }
    }
    expect(packed.hits.mention.some((hit) => hit.text.includes("useEffect"))).toBe(true)
    expect(packed.hits.mention[0]?.origin).toBe("mention")
  })
})


