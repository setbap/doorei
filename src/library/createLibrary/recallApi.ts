import {
  ASK_COMPACT_SYSTEM,
  askTokenCount,
  historyForPack,
  packAskHits,
  sessionSummarySnippets,
  summarySnippets
} from "../askPack.js"
import {
  mentionableItems,
  mentionCaptionHits,
  resolveMentionedVideoIds,
  resolveMentions,
  userTurnText
} from "../askMentions.js"
import { persistLibrary } from "../persist/index.js"
import { settingsForCourse } from "../courseSettings.js"
import type { ConversationTurn, Hit, Library } from "../types.js"
import type { LibraryCore } from "./core.js"
import { id, titleFromQuestion, unwrapFence } from "./helpers.js"

export function recallApi(core: LibraryCore): Pick<
  Library,
  | "addNote"
  | "editNote"
  | "search"
  | "ask"
  | "createConversation"
  | "selectConversation"
  | "renameConversation"
  | "deleteConversation"
  | "retryJob"
  | "dismissFailedJobs"
  | "regenerateCaption"
  | "generateSummary"
  | "generateMissingSummaries"
> {
  const { state, deps } = core
  return {
    async addNote(input) {
      core.assertUsable()
      const video = core.selectedVideo()
      const noteId = id("nte")
      state.notes.push({
        id: noteId,
        videoId: video.id,
        text: input.text,
        timestampSeconds: input.timestampSeconds ?? null
      })
      core.emit()
      return noteId
    },
    async editNote(noteId, text) {
      core.assertUsable()
      const note = state.notes.find((item) => item.id === noteId)
      if (!note) throw new Error("Note not found")
      note.text = text
      core.emit()
    },
    search: async (input) => {
      core.assertUsable()
      const hits = await core.collectHits(input)
      state.searchHits = hits
      persistLibrary(deps.dataDir, state, { kind: "app" })
      core.notifyLight()
      return hits
    },
    async ask(input) {
      core.assertUsable()
      if (!state.provider) {
        throw new Error("Ask is off until a Provider is configured")
      }
      if (!deps.providerClient) {
        throw new Error("Provider is not available")
      }
      if (!state.selectedCourseId) throw new Error("No Course selected")
      const courseId = state.selectedCourseId
      const video = state.videos.find((item) => item.id === state.selectedVideoId) ?? null
      const session = video
        ? (state.sessions.find((item) => item.id === video.sessionId) ?? null)
        : null
      const mentionList = resolveMentions(
        input.mentions ?? [],
        mentionableItems({
          selectedCourseId: courseId,
          sessions: state.sessions,
          videos: state.videos
        })
      )
      const mentionedVideoIds = resolveMentionedVideoIds(mentionList, state.videos)
      const allHits = await core.collectHits({
        text: input.question,
        scope: "course",
        videoIds: mentionedVideoIds.length > 0 ? mentionedVideoIds : undefined
      })
      const packedBuckets = packAskHits(
        allHits,
        video?.id ?? null,
        video?.sessionId ?? null,
        mentionedVideoIds
      )
      const { videoHits, sessionHits, courseHits } = packedBuckets
      let packedHits = packedBuckets.packedHits
      let mentionHits = packedBuckets.mentionHits
      if (mentionedVideoIds.length > 0) {
        const captions: Record<string, ReturnType<LibraryCore["recallCaption"]>> = {}
        for (const videoId of mentionedVideoIds) captions[videoId] = core.recallCaption(videoId)
        const extra = mentionCaptionHits(mentionedVideoIds, state.videos, captions, mentionHits)
        mentionHits = [...mentionHits, ...extra]
        packedHits = mentionHits
      }
      const currentVideoSummary = video ? (state.summaries[video.id] ?? null) : null
      const currentVideoSummaryMissing = Boolean(video) && currentVideoSummary === null
      const sessionSummaries =
        mentionedVideoIds.length > 0
          ? summarySnippets(mentionedVideoIds, state.summaries)
          : sessionSummarySnippets(sessionHits, state.summaries)
      const existing = core.activeConversation()
      const course = settingsForCourse(state, courseId)
      const outputLanguage = course.outputLanguage
      const budget = state.settings.askContextBudgetTokens ?? 24_000
      const system = course.prompts.ask
      const displayQuestion = userTurnText(input.question, mentionList)
      const pack = (turns: ConversationTurn[]): string =>
        JSON.stringify({
          outputLanguage,
          currentVideo: video ? { id: video.id, name: video.name } : null,
          currentSession: session ? { id: session.id, name: session.name } : null,
          currentVideoSummary,
          currentVideoSummaryMissing,
          sessionSummaries,
          mentions: mentionList,
          hits: { video: videoHits, session: sessionHits, course: courseHits, mention: mentionHits },
          history: historyForPack(turns),
          question: input.question
        })
      try {
        let packTurns = existing?.turns.slice() ?? []
        let compactTurn: ConversationTurn | null = null
        if (packTurns.length > 0 && askTokenCount(pack(packTurns)) > budget) {
          const recap = unwrapFence(
            await deps.providerClient.complete({
              system: ASK_COMPACT_SYSTEM,
              prompt: JSON.stringify(historyForPack(packTurns))
            })
          )
          if (recap) {
            compactTurn = {
              id: id("trn"),
              kind: "compact",
              text: recap,
              hits: packTurns.flatMap((turn) => turn.hits)
            }
            packTurns = [compactTurn]
          }
        }
        while (packTurns.length > 0 && askTokenCount(pack(packTurns)) > budget) {
          packTurns = packTurns.slice(1)
        }
        const raw = await deps.providerClient.complete({
          system,
          prompt: pack(packTurns)
        })
        let text = raw
        let cited: Hit[] = packedHits
        try {
          const parsed = JSON.parse(raw) as { text?: string; hitIndexes?: number[] }
          if (typeof parsed.text === "string") {
            text = parsed.text
            if (Array.isArray(parsed.hitIndexes)) {
              cited = parsed.hitIndexes
                .map((index) => packedHits[index])
                .filter((hit): hit is Hit => hit !== undefined)
            }
          }
        } catch {
          /* raw prose answer */
        }
        const conversation =
          existing ??
          (() => {
            const created = {
              id: id("cnv"),
              courseId,
              title: titleFromQuestion(input.question),
              updatedAt: Date.now(),
              turns: [] as ConversationTurn[]
            }
            state.conversations.push(created)
            state.activeConversationByCourse[courseId] = created.id
            return created
          })()
        if (!conversation.title) conversation.title = titleFromQuestion(input.question)
        if (compactTurn) conversation.turns = [compactTurn]
        conversation.turns.push(
          { id: id("trn"), kind: "user", text: displayQuestion, hits: [] },
          { id: id("trn"), kind: "assistant", text, hits: cited }
        )
        conversation.updatedAt = Date.now()
        state.lastAskError = null
        core.persistAsk()
        return { text, hits: cited }
      } catch (error) {
        state.lastAskError = error instanceof Error ? error.message : String(error)
        core.persistAsk()
        throw error
      }
    },
    async createConversation() {
      core.assertUsable()
      if (!state.selectedCourseId) throw new Error("No Course selected")
      const created = {
        id: id("cnv"),
        courseId: state.selectedCourseId,
        title: "",
        updatedAt: Date.now(),
        turns: [] as ConversationTurn[]
      }
      state.conversations.push(created)
      state.activeConversationByCourse[state.selectedCourseId] = created.id
      core.persistAsk()
      return created.id
    },
    async selectConversation(conversationId) {
      core.assertUsable()
      if (!state.selectedCourseId) throw new Error("No Course selected")
      const conversation = state.conversations.find(
        (item) => item.id === conversationId && item.courseId === state.selectedCourseId
      )
      if (!conversation) throw new Error("Conversation not found")
      state.activeConversationByCourse[state.selectedCourseId] = conversation.id
      core.persistAsk()
    },
    async renameConversation(conversationId, title) {
      core.assertUsable()
      const conversation = state.conversations.find((item) => item.id === conversationId)
      if (!conversation) throw new Error("Conversation not found")
      conversation.title = title.trim()
      conversation.updatedAt = Date.now()
      core.persistAsk(conversation.courseId)
    },
    async deleteConversation(conversationId) {
      core.assertUsable()
      const conversation = state.conversations.find((item) => item.id === conversationId)
      if (!conversation) throw new Error("Conversation not found")
      const courseId = conversation.courseId
      state.conversations = state.conversations.filter((item) => item.id !== conversationId)
      if (state.activeConversationByCourse[courseId] === conversationId) {
        const next = state.conversations.find((item) => item.courseId === courseId)
        if (next) state.activeConversationByCourse[courseId] = next.id
        else delete state.activeConversationByCourse[courseId]
      }
      core.persistAsk(courseId)
    },
    async retryJob(jobId) {
      core.assertUsable()
      const job = state.jobs.find((item) => item.id === jobId)
      if (!job) throw new Error("Job not found")
      job.status = "queued"
      job.error = null
      core.emit()
      core.kick()
    },
    async dismissFailedJobs() {
      core.assertUsable()
      state.jobs = state.jobs.filter((job) => job.status !== "failed")
      core.emit({ kind: "library" })
    },
    async regenerateCaption(videoId) {
      core.assertUsable()
      delete state.captions[videoId]
      delete state.improvedCaptions[videoId]
      const video = state.videos.find((item) => item.id === videoId)
      if (video) video.captioningProgress = 0
      state.jobs = state.jobs.filter(
        (job) =>
          !(
            job.videoId === videoId &&
            (job.kind === "improve" || job.kind === "summary") &&
            job.status === "failed"
          )
      )
      core.upsertJob("captioning", videoId)
      core.emit()
      core.kick()
    },
    async generateSummary(videoId) {
      core.assertUsable()
      if (!state.provider) throw new Error("Provider is not configured")
      const caption = state.captions[videoId]
      if (!caption?.segments.length) throw new Error("No Caption to summarize")
      core.requestRecall(videoId, "force")
      core.emitForVideo(videoId)
      core.kick()
    },
    async generateMissingSummaries() {
      core.assertUsable()
      if (!state.provider) throw new Error("Provider is not configured")
      const needed = core.videosNeedingSummary()
      const seen = new Set(core.missingSummaryQueue)
      for (const videoId of needed) {
        if (!seen.has(videoId)) core.missingSummaryQueue.push(videoId)
      }
      core.startNextMissingSummary()
    }
  }
}
