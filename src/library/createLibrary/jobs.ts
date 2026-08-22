import { persistLibrary } from "../persist/index.js"
import { settingsForVideo } from "../courseSettings.js"
import { REQUIRED_MODELS } from "../models.js"
import type { Caption, CaptionSegment, Job, SpokenLanguage } from "../types.js"
import type { LibraryCore } from "./core.js"
import { captionLines, chunkCaption, id, l2Normalize, parseImprovedTexts, unwrapFence } from "./helpers.js"
import { courseIdOfVideo, recallCaption, treeVideos } from "./tree.js"

function asrModelId(language: SpokenLanguage): string {
  return language === "en" ? REQUIRED_MODELS.parakeet : REQUIRED_MODELS.shenava
}

export function bindJobs(core: LibraryCore): void {
  const { state, deps } = core
  let lastCaptionNotifyAt = 0

  function upsertJob(kind: Job["kind"], videoId: string): Job {
    let job = state.jobs.find((item) => item.kind === kind && item.videoId === videoId)
    if (!job) {
      job = {
        id: id("job"),
        kind,
        videoId,
        status: "queued",
        progress: 0,
        error: null
      }
      state.jobs.push(job)
    } else {
      job.status = "queued"
      job.progress = 0
      job.error = null
    }
    return job
  }

  function summaryJobOpen(videoId: string): boolean {
    return state.jobs.some(
      (job) =>
        job.videoId === videoId &&
        job.kind === "summary" &&
        (job.status === "queued" || job.status === "running")
    )
  }

  function queueSummaryIfMissing(videoId: string): void {
    if (state.summaries[videoId]) return
    if (!(state.captions[videoId]?.segments.length ?? 0)) return
    if (summaryJobOpen(videoId)) return
    upsertJob("summary", videoId)
  }

  function requestRecall(videoId: string, mode: "force" | "missing"): void {
    if (mode === "force") {
      upsertJob("summary", videoId)
      upsertJob("improve", videoId)
      return
    }
    queueSummaryIfMissing(videoId)
  }

  function afterImprove(videoId: string, outcome: "ok" | "failed" | "off"): void {
    if (outcome === "ok") upsertJob("embed", videoId)
    if (outcome === "off") {
      finishMissingSummary(videoId)
      return
    }
    const alreadyCovered = Boolean(state.summaries[videoId]) || summaryJobOpen(videoId)
    queueSummaryIfMissing(videoId)
    if (alreadyCovered) finishMissingSummary(videoId)
  }

  function videosNeedingSummary(): string[] {
    if (!state.selectedCourseId) return []
    const sessionIds = new Set(
      state.sessions
        .filter((session) => session.courseId === state.selectedCourseId)
        .map((session) => session.id)
    )
    return treeVideos(state)
      .filter((video) => sessionIds.has(video.sessionId))
      .filter(
        (video) => !state.summaries[video.id] && (state.captions[video.id]?.segments.length ?? 0) > 0
      )
      .map((video) => video.id)
  }

  function startNextMissingSummary(): void {
    while (core.missingSummaryQueue.length > 0) {
      const videoId = core.missingSummaryQueue[0]!
      if (state.summaries[videoId] || !(state.captions[videoId]?.segments.length ?? 0)) {
        core.missingSummaryQueue.shift()
        continue
      }
      const busy = summaryJobOpen(videoId)
      if (busy) return
      upsertJob("summary", videoId)
      core.emit()
      kick()
      return
    }
  }

  function finishMissingSummary(videoId: string): void {
    if (core.missingSummaryQueue[0] !== videoId) return
    core.missingSummaryQueue.shift()
    startNextMissingSummary()
  }

  function afterCaption(videoId: string): void {
    upsertJob("embed", videoId)
  }

  async function runCaptioning(job: Job): Promise<void> {
    const video = state.videos.find((item) => item.id === job.videoId)
    if (!video) throw new Error("Video not found")
    const modelId = asrModelId(video.spokenLanguage)
    if (!deps.modelStore.isComplete(modelId)) {
      job.status = "failed"
      job.error = "ASR Model is not fully on disk"
      core.emit()
      return
    }
    const existing = state.captions[video.id]
    const caption: Caption =
      existing?.source === "asr" ? existing : { source: "asr", segments: [] }
    state.captions[video.id] = caption
    const resumeAfter = caption.segments.at(-1)?.endSeconds ?? -1
    await deps.speechRecognizer.caption({
      modelId,
      videoPath: video.path,
      onSegment: (segment: CaptionSegment) => {
        if (segment.endSeconds <= resumeAfter) return
        caption.segments.push(segment)
      },
      onProgress: (progress) => {
        job.progress = Math.min(0.99, Math.max(0, progress))
        video.captioningProgress = job.progress
        persistLibrary(deps.dataDir, state, { kind: "captioning", videoId: video.id })
        const now = Date.now()
        if (now - lastCaptionNotifyAt >= 200) {
          lastCaptionNotifyAt = now
          core.notifyLight()
        }
      }
    })
    if (job.status === "failed") return
    job.status = "complete"
    job.progress = 1
    video.captioningProgress = 1
    core.emit({ kind: "captioning", videoId: video.id })
    afterCaption(video.id)
    await new Promise<void>((resolve) => setImmediate(resolve))
  }

  async function runEmbed(job: Job): Promise<void> {
    const caption = recallCaption(state, job.videoId)
    const notes = state.notes.filter((note) => note.videoId === job.videoId)
    const texts = [...(caption?.segments.map((segment) => segment.text) ?? []), ...notes.map((note) => note.text)]
    const vectors = texts.length > 0 ? await deps.embedder.embed(texts) : []
    const captionCount = caption?.segments.length ?? 0
    state.embeddings[job.videoId] = [
      ...(caption?.segments.map((_, index) => ({
        segmentIndex: index,
        vector: l2Normalize(vectors[index] ?? []),
        kind: "caption" as const
      })) ?? []),
      ...notes.map((note, index) => ({
        segmentIndex: index,
        vector: l2Normalize(vectors[captionCount + index] ?? []),
        kind: "note" as const,
        noteId: note.id
      }))
    ]
    const courseId = courseIdOfVideo(state, job.videoId)
    if (courseId) {
      persistLibrary(deps.dataDir, state, {
        kind: "embeddings",
        courseId,
        videoId: job.videoId
      })
    }
    job.status = "complete"
    job.progress = 1
    core.emitForVideo(job.videoId)
  }

  async function runImprove(job: Job): Promise<void> {
    if (!state.provider) {
      job.status = "off"
      core.emitForVideo(job.videoId)
      afterImprove(job.videoId, "off")
      return
    }
    if (!deps.providerClient) {
      throw new Error("Provider is not available")
    }
    const video = state.videos.find((item) => item.id === job.videoId)
    if (!video) throw new Error("Video not found")
    const caption = state.captions[job.videoId]
    if (!caption) throw new Error("No Caption to improve")
    const chunks = chunkCaption(caption.segments)
    const improved: CaptionSegment[] = []
    let parsedAny = false
    let lastError: Error | null = null
    for (const [chunkIndex, chunk] of chunks.entries()) {
      job.progress = chunkIndex / chunks.length
      core.emit("ui")
      const raw = await deps.providerClient.complete({
        system: settingsForVideo(state, job.videoId).prompts.improve,
        prompt: `Spoken language: ${video.spokenLanguage}\nRewrite these Caption texts as JSON. Return a JSON array of strings, same order, same count.\n${JSON.stringify(chunk.map((segment) => segment.text))}`
      })
      let texts: string[]
      try {
        texts = parseImprovedTexts(
          raw,
          chunk.map((segment) => segment.text)
        )
        parsedAny = true
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        improved.push(...chunk)
        continue
      }
      for (const [index, segment] of chunk.entries()) {
        improved.push({
          startSeconds: segment.startSeconds,
          endSeconds: segment.endSeconds,
          text: texts[index] ?? segment.text
        })
      }
    }
    if (!parsedAny) {
      job.status = "failed"
      job.error = lastError?.message ?? "Provider returned invalid Improved Caption"
      core.emitForVideo(job.videoId)
      afterImprove(job.videoId, "failed")
      kick()
      return
    }
    state.improvedCaptions[job.videoId] = { source: caption.source, segments: improved }
    job.status = "complete"
    job.progress = 1
    core.emitForVideo(job.videoId)
    afterImprove(job.videoId, "ok")
    kick()
  }

  async function runSummary(job: Job): Promise<void> {
    if (!state.provider) {
      job.status = "off"
      core.emitForVideo(job.videoId)
      finishMissingSummary(job.videoId)
      return
    }
    if (!deps.providerClient) {
      throw new Error("Provider is not available")
    }
    const caption = recallCaption(state, job.videoId)
    if (!caption) throw new Error("No Caption to summarize")
    const course = settingsForVideo(state, job.videoId)
    const text = unwrapFence(
      await deps.providerClient.complete({
        system: course.prompts.summary,
        prompt: `Output language: ${course.outputLanguage}\n${captionLines(caption.segments)}`
      })
    )
    if (!text) throw new Error("Provider returned an empty Summary")
    state.summaries[job.videoId] = text
    job.status = "complete"
    job.progress = 1
    core.emitForVideo(job.videoId)
    finishMissingSummary(job.videoId)
  }

  function kick(): void {
    core.chain = core.chain
      .catch(() => undefined)
      .then(async () => {
        const job =
          state.jobs.find((item) => item.status === "queued" && item.kind === "captioning") ??
          state.jobs.find((item) => item.status === "queued" && item.kind === "summary") ??
          state.jobs.find((item) => item.status === "queued")
        if (!job) return
        job.status = "running"
        core.emit("ui")
        try {
          if (job.kind === "captioning") await runCaptioning(job)
          else if (job.kind === "embed") await runEmbed(job)
          else if (job.kind === "improve") await runImprove(job)
          else if (job.kind === "summary") await runSummary(job)
        } catch (error) {
          job.status = "failed"
          job.error = error instanceof Error ? error.message : String(error)
          core.emitForVideo(job.videoId)
          if (job.kind === "improve") afterImprove(job.videoId, "failed")
          else if (job.kind === "summary") finishMissingSummary(job.videoId)
        }
        if (state.jobs.some((item) => item.status === "queued")) kick()
      })
  }

  core.upsertJob = upsertJob
  core.requestRecall = requestRecall
  core.afterImprove = afterImprove
  core.videosNeedingSummary = videosNeedingSummary
  core.startNextMissingSummary = startNextMissingSummary
  core.finishMissingSummary = finishMissingSummary
  core.afterCaption = afterCaption
  core.kick = kick
}
