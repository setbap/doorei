import { formatStamp } from "./hitLinks.js"
import { jsonrepair } from "jsonrepair"
import { REQUIRED_MODELS } from "./models.js"
import { captionFromSidecar } from "./parseCaption.js"
import { DEFAULT_PROMPTS, DEFAULT_SETTINGS, LEGACY_IMPROVE_PROMPT } from "./defaults.js"
import {
  ASK_COMPACT_SYSTEM,
  askTokenCount,
  historyForPack,
  packAskHits,
  sessionSummarySnippets
} from "./askPack.js"
import {
  providerByKindFromVault,
  providerConfigFromFields,
  providerVaultFromFields
} from "./providerConfig.js"
import {
  deleteCourseData,
  loadCourseEmbeddings,
  loadLibrary,
  persistLibrary,
  saveVideoEmbeddings,
  type LibraryState,
  type PersistHint
} from "./persist.js"
import type {
  AppLanguage,
  Caption,
  CaptionSegment,
  ConversationTurn,
  Hit,
  Job,
  Library,
  LibraryDeps,
  LibrarySnapshot,
  ProviderConfig,
  ProviderFieldKind,
  ProviderKind,
  ProviderKindFields,
  ProviderVault,
  SearchScope,
  SpokenLanguage,
  VideoRecord
} from "./types.js"

const IMPROVE_CHUNK_SEGMENTS = 80
const IMPROVE_CHUNK_CHARS = 12_000

type State = LibraryState

function loadState(dataDir: string): State {
  const loaded = loadLibrary(dataDir)
  loaded.prompts = migratePrompts(loaded.prompts)
  return loaded
}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

function basename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path
}

function titleFromQuestion(question: string): string {
  const trimmed = question.trim().replace(/\s+/g, " ")
  return trimmed.length <= 80 ? trimmed : trimmed.slice(0, 80)
}

function unwrapFence(text: string): string {
  const trimmed = text.trim()
  const fenced = /^```(?:json|markdown|md)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed)
  return (fenced ? fenced[1] : trimmed).trim()
}

function migratePrompts(loaded: Partial<State["prompts"]> | undefined): State["prompts"] {
  const prompts = { ...DEFAULT_PROMPTS, ...loaded }
  if (!loaded?.improve || loaded.improve === LEGACY_IMPROVE_PROMPT) {
    prompts.improve = DEFAULT_PROMPTS.improve
  }
  return prompts
}

function parseJsonArray(raw: string): unknown[] {
  const unwrapped = unwrapFence(raw)
  const start = unwrapped.indexOf("[")
  const end = unwrapped.lastIndexOf("]")
  const candidates = [unwrapped]
  if (start >= 0 && end > start) {
    candidates.push(unwrapped.slice(start, end + 1))
  }
  let lastError: unknown
  for (const candidate of candidates) {
    try {
      return asJsonArray(JSON.parse(candidate))
    } catch (error) {
      lastError = error
    }
    try {
      return asJsonArray(JSON.parse(jsonrepair(candidate)))
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Provider returned invalid Improved Caption")
}

function asJsonArray(parsed: unknown): unknown[] {
  if (!Array.isArray(parsed)) {
    throw new Error("Provider returned invalid Improved Caption")
  }
  return parsed
}

function parseImprovedTexts(raw: string, originals: string[]): string[] {
  const parsed = parseJsonArray(raw)
  return originals.map((original, index) => {
    const item = parsed[index]
    if (typeof item === "string") return item
    if (item && typeof item === "object" && "text" in item) {
      const text = (item as { text: unknown }).text
      if (typeof text === "string") return text
    }
    return original
  })
}

function chunkCaption(segments: CaptionSegment[]): CaptionSegment[][] {
  const chunks: CaptionSegment[][] = []
  let current: CaptionSegment[] = []
  let chars = 0
  for (const segment of segments) {
    const extra = segment.text.length + 4
    if (
      current.length > 0 &&
      (current.length >= IMPROVE_CHUNK_SEGMENTS || chars + extra > IMPROVE_CHUNK_CHARS)
    ) {
      chunks.push(current)
      current = []
      chars = 0
    }
    current.push(segment)
    chars += extra
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

function captionLines(segments: CaptionSegment[]): string {
  return segments
    .map((segment) => `[${formatStamp(segment.startSeconds)}] ${segment.text}`)
    .join("\n")
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i += 1) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    dot += x * y
    na += x * x
    nb += y * y
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export function createLibrary(deps: LibraryDeps): Library {
  let state = loadState(deps.dataDir)
  const listeners = new Set<() => void>()

  function notify(): void {
    for (const listener of listeners) listener()
  }

  function emit(hint?: PersistHint | "ui"): void {
    if (hint !== "ui") {
      persistLibrary(deps.dataDir, state, hint ?? defaultHint())
    }
    notify()
  }

  function defaultHint(): PersistHint {
    return state.selectedCourseId
      ? { kind: "course", courseId: state.selectedCourseId }
      : { kind: "app" }
  }

  function persistAsk(courseId = state.selectedCourseId): void {
    if (courseId) {
      persistLibrary(deps.dataDir, state, { kind: "ask", courseId })
      notify()
      return
    }
    emit()
  }

  function emitForVideo(videoId: string): void {
    const courseId = courseIdOfVideo(videoId)
    emit(courseId ? { kind: "course", courseId } : undefined)
  }

  function vaultForSnapshot(): ProviderVault {
    const vault: ProviderVault = { ...state.providerVault }
    if (!state.provider) return vault
    const { kind, ...fields } = state.provider
    vault[kind] = { ...vault[kind], ...fields }
    return vault
  }

  function courseIdOfVideo(videoId: string): string | null {
    const video = state.videos.find((item) => item.id === videoId)
    if (!video) return null
    return state.sessions.find((session) => session.id === video.sessionId)?.courseId ?? null
  }

  function loadEmbeddingsForCourse(courseId: string): void {
    state.embeddings = loadCourseEmbeddings(deps.dataDir, courseId)
  }

  function modelsComplete(): boolean {
    return Object.values(REQUIRED_MODELS).every((modelId) => deps.modelStore.isComplete(modelId))
  }

  function usable(): boolean {
    if (state.gatePassed) return true
    const ok = state.appLanguage !== null && modelsComplete()
    if (ok) state.gatePassed = true
    return ok
  }

  function direction(): "rtl" | "ltr" {
    return (state.appLanguage ?? "fa") === "fa" ? "rtl" : "ltr"
  }

  function assertUsable(): void {
    if (!usable()) {
      throw new Error(
        "Library is unusable until App language is chosen and required models are on disk"
      )
    }
  }

  function treeSessions() {
    return state.sessions.slice().sort((a, b) => {
      const courseA = state.courses.findIndex((course) => course.id === a.courseId)
      const courseB = state.courses.findIndex((course) => course.id === b.courseId)
      if (courseA !== courseB) return courseA - courseB
      return a.position - b.position
    })
  }

  function treeVideos() {
    return state.videos.slice().sort((a, b) => {
      const sessionA = state.sessions.find((session) => session.id === a.sessionId)
      const sessionB = state.sessions.find((session) => session.id === b.sessionId)
      const courseA = state.courses.findIndex((course) => course.id === sessionA?.courseId)
      const courseB = state.courses.findIndex((course) => course.id === sessionB?.courseId)
      if (courseA !== courseB) return courseA - courseB
      const sessionPosA = sessionA?.position ?? 0
      const sessionPosB = sessionB?.position ?? 0
      if (sessionPosA !== sessionPosB) return sessionPosA - sessionPosB
      return a.position - b.position
    })
  }

  function refreshMissingFlags(): void {
    for (const video of state.videos) {
      video.fileMissing = !deps.media.exists(video.path)
    }
  }

  function selectedVideo(): VideoRecord {
    const video = state.videos.find((item) => item.id === state.selectedVideoId)
    if (!video) throw new Error("No Video selected")
    return video
  }

  function removeVideoRecord(videoId: string): void {
    const courseId = courseIdOfVideo(videoId)
    state.videos = state.videos.filter((video) => video.id !== videoId)
    state.notes = state.notes.filter((note) => note.videoId !== videoId)
    delete state.captions[videoId]
    delete state.improvedCaptions[videoId]
    delete state.summaries[videoId]
    delete state.embeddings[videoId]
    state.jobs = state.jobs.filter((job) => job.videoId !== videoId)
    if (state.selectedVideoId === videoId) {
      state.selectedVideoId = null
    }
    if (courseId) saveVideoEmbeddings(deps.dataDir, courseId, videoId, [])
  }

  function activeConversation() {
    if (!state.selectedCourseId) return null
    const activeId = state.activeConversationByCourse[state.selectedCourseId]
    if (!activeId) return null
    return (
      state.conversations.find(
        (item) => item.id === activeId && item.courseId === state.selectedCourseId
      ) ?? null
    )
  }

  function videosInScope(scope: SearchScope): VideoRecord[] {
    if (scope === "video") {
      const video = selectedVideo()
      return [video]
    }
    if (scope === "session") {
      const video = selectedVideo()
      return state.videos.filter((item) => item.sessionId === video.sessionId)
    }
    if (!state.selectedCourseId) return []
    const sessionIds = new Set(
      state.sessions
        .filter((session) => session.courseId === state.selectedCourseId)
        .map((session) => session.id)
    )
    return state.videos.filter((video) => sessionIds.has(video.sessionId))
  }

  function recallCaption(videoId: string): Caption | null {
    return state.improvedCaptions[videoId] ?? state.captions[videoId] ?? null
  }

  async function collectHits(input: { text: string; scope: SearchScope }): Promise<Hit[]> {
    for (const video of videosInScope(input.scope)) {
      const courseId = courseIdOfVideo(video.id)
      if (courseId && !(video.id in state.embeddings)) loadEmbeddingsForCourse(courseId)
    }
    const lexical = lexicalSearch(input)
    const hits = [...lexical]
    const seen = new Set(lexical.map((hit) => `${hit.kind}:${hit.videoId}:${hit.startSeconds}:${hit.text}`))
    const needle = input.text.trim()
    if (!needle) return hits
    const [queryVector] = await deps.embedder.embed([needle])
    if (!queryVector || queryVector.every((value) => value === 0)) return hits
    for (const video of videosInScope(input.scope)) {
      const caption = recallCaption(video.id)
      for (const item of state.embeddings[video.id] ?? []) {
        const score = cosine(queryVector, item.vector)
        if (score < 0.75) continue
        if (item.kind === "caption" && caption) {
          const segment = caption.segments[item.segmentIndex]
          if (!segment) continue
          const key = `caption:${video.id}:${segment.startSeconds}:${segment.text}`
          if (seen.has(key)) continue
          seen.add(key)
          hits.push({
            videoId: video.id,
            sessionId: video.sessionId,
            startSeconds: segment.startSeconds,
            text: segment.text,
            kind: "caption",
            score
          })
        }
      }
    }
    return hits.slice().sort((a, b) => b.score - a.score)
  }

  function lexicalSearch(input: { text: string; scope: SearchScope }): Hit[] {
    const needle = input.text.trim().toLowerCase()
    if (!needle) return []
    const tokens = needle
      .split(/\s+/)
      .map((token) => token.replace(/[^\p{L}\p{N}]+/gu, ""))
      .filter((token) => token.length >= 3)
    const terms = tokens.length > 0 ? tokens : [needle]
    const hits: Hit[] = []
    for (const video of videosInScope(input.scope)) {
      const caption = recallCaption(video.id)
      if (caption) {
        for (const segment of caption.segments) {
          const haystack = segment.text.toLowerCase()
          if (haystack.includes(needle) || terms.some((term) => haystack.includes(term))) {
            hits.push({
              videoId: video.id,
              sessionId: video.sessionId,
              startSeconds: segment.startSeconds,
              text: segment.text,
              kind: "caption",
              score: 1
            })
          }
        }
      }
      for (const note of state.notes.filter((item) => item.videoId === video.id)) {
        if (note.text.toLowerCase().includes(needle)) {
          hits.push({
            videoId: video.id,
            sessionId: video.sessionId,
            startSeconds: note.timestampSeconds,
            text: note.text,
            kind: "note",
            score: 1
          })
        }
      }
    }
    return hits
  }

  let chain: Promise<void> = Promise.resolve()

  function asrModelId(language: SpokenLanguage): string {
    return language === "en" ? REQUIRED_MODELS.parakeet : REQUIRED_MODELS.shenava
  }

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

  let missingSummaryQueue: string[] = []

  function videosNeedingSummary(): string[] {
    if (!state.selectedCourseId) return []
    const sessionIds = new Set(
      state.sessions
        .filter((session) => session.courseId === state.selectedCourseId)
        .map((session) => session.id)
    )
    return treeVideos()
      .filter((video) => sessionIds.has(video.sessionId))
      .filter(
        (video) => !state.summaries[video.id] && (state.captions[video.id]?.segments.length ?? 0) > 0
      )
      .map((video) => video.id)
  }

  function startNextMissingSummary(): void {
    while (missingSummaryQueue.length > 0) {
      const videoId = missingSummaryQueue[0]!
      if (state.summaries[videoId] || !(state.captions[videoId]?.segments.length ?? 0)) {
        missingSummaryQueue.shift()
        continue
      }
      const busy = summaryJobOpen(videoId)
      if (busy) return
      upsertJob("summary", videoId)
      emit()
      kick()
      return
    }
  }

  function finishMissingSummary(videoId: string): void {
    if (missingSummaryQueue[0] !== videoId) return
    missingSummaryQueue.shift()
    startNextMissingSummary()
  }

  function kick(): void {
    chain = chain
      .catch(() => undefined)
      .then(async () => {
        const job =
          state.jobs.find((item) => item.status === "queued" && item.kind === "captioning") ??
          state.jobs.find((item) => item.status === "queued" && item.kind === "summary") ??
          state.jobs.find((item) => item.status === "queued")
        if (!job) return
        job.status = "running"
        emit("ui")
        try {
          if (job.kind === "captioning") await runCaptioning(job)
          else if (job.kind === "embed") await runEmbed(job)
          else if (job.kind === "improve") await runImprove(job)
          else if (job.kind === "summary") await runSummary(job)
        } catch (error) {
          job.status = "failed"
          job.error = error instanceof Error ? error.message : String(error)
          emitForVideo(job.videoId)
          if (job.kind === "improve") afterImprove(job.videoId, "failed")
          else if (job.kind === "summary") finishMissingSummary(job.videoId)
        }
        if (state.jobs.some((item) => item.status === "queued")) kick()
      })
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
      emit()
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
        emit({ kind: "captioning", videoId: video.id })
      }
    })
    if (job.status === "failed") return
    job.status = "complete"
    job.progress = 1
    video.captioningProgress = 1
    emit({ kind: "captioning", videoId: video.id })
    afterCaption(video.id)
    await new Promise<void>((resolve) => setImmediate(resolve))
  }

  async function runEmbed(job: Job): Promise<void> {
    const caption = recallCaption(job.videoId)
    const notes = state.notes.filter((note) => note.videoId === job.videoId)
    const texts = [...(caption?.segments.map((segment) => segment.text) ?? []), ...notes.map((note) => note.text)]
    const vectors = texts.length > 0 ? await deps.embedder.embed(texts) : []
    const captionCount = caption?.segments.length ?? 0
    state.embeddings[job.videoId] = [
      ...(caption?.segments.map((_, index) => ({
        segmentIndex: index,
        vector: vectors[index] ?? [],
        kind: "caption" as const
      })) ?? []),
      ...notes.map((note, index) => ({
        segmentIndex: index,
        vector: vectors[captionCount + index] ?? [],
        kind: "note" as const,
        noteId: note.id
      }))
    ]
    const courseId = courseIdOfVideo(job.videoId)
    if (courseId) {
      persistLibrary(deps.dataDir, state, {
        kind: "embeddings",
        courseId,
        videoId: job.videoId
      })
    }
    job.status = "complete"
    job.progress = 1
    emitForVideo(job.videoId)
  }

  async function runImprove(job: Job): Promise<void> {
    if (!state.provider) {
      job.status = "off"
      emitForVideo(job.videoId)
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
      emit("ui")
      const raw = await deps.providerClient.complete({
        system: state.prompts.improve,
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
      emitForVideo(job.videoId)
      afterImprove(job.videoId, "failed")
      kick()
      return
    }
    state.improvedCaptions[job.videoId] = { source: caption.source, segments: improved }
    job.status = "complete"
    job.progress = 1
    emitForVideo(job.videoId)
    afterImprove(job.videoId, "ok")
    kick()
  }

  async function runSummary(job: Job): Promise<void> {
    if (!state.provider) {
      job.status = "off"
      emitForVideo(job.videoId)
      finishMissingSummary(job.videoId)
      return
    }
    if (!deps.providerClient) {
      throw new Error("Provider is not available")
    }
    const caption = recallCaption(job.videoId)
    if (!caption) throw new Error("No Caption to summarize")
    const outputLanguage = state.outputLanguage ?? state.appLanguage ?? "fa"
    const text = unwrapFence(
      await deps.providerClient.complete({
        system: state.prompts.summary,
        prompt: `Output language: ${outputLanguage}\n${captionLines(caption.segments)}`
      })
    )
    if (!text) throw new Error("Provider returned an empty Summary")
    state.summaries[job.videoId] = text
    job.status = "complete"
    job.progress = 1
    emitForVideo(job.videoId)
    finishMissingSummary(job.videoId)
  }

  for (const job of state.jobs) {
    if (job.status === "running") job.status = "queued"
  }
  kick()

  function snapshot(): LibrarySnapshot {
    refreshMissingFlags()
    const selected = state.videos.find((video) => video.id === state.selectedVideoId) ?? null
    const selectedCourse =
      state.courses.find((course) => course.id === state.selectedCourseId) ?? null
    return {
      usable: usable(),
      appLanguage: state.appLanguage,
      outputLanguage: state.outputLanguage ?? state.appLanguage ?? "fa",
      direction: direction(),
      providerConfigured: state.provider !== null,
      provider: state.provider ? { ...state.provider } : null,
      providerVault: vaultForSnapshot(),
      spokenLanguageDefault: state.spokenLanguageDefault,
      settings: { ...DEFAULT_SETTINGS, ...state.settings },
      prompts: { ...state.prompts },
      requiredModels: Object.values(REQUIRED_MODELS).map((modelId) => ({
        id: modelId,
        complete: deps.modelStore.isComplete(modelId)
      })),
      courses: state.courses.map((course) => ({ ...course })),
      selectedCourseId: state.selectedCourseId,
      selectedVideoId: state.selectedVideoId,
      sessions: treeSessions().map((session) => ({ ...session })),
      videos: treeVideos().map((video) => ({
        ...video,
        hasSummary: Boolean(state.summaries[video.id])
      })),
      notes: selected
        ? state.notes.filter((note) => note.videoId === selected.id).map((note) => ({ ...note }))
        : [],
      caption: selected ? (state.captions[selected.id] ?? null) : null,
      improvedCaption: selected ? (state.improvedCaptions[selected.id] ?? null) : null,
      summary: selected ? (state.summaries[selected.id] ?? null) : null,
      jobs: state.jobs.map((job) => ({ ...job })),
      searchHits: state.searchHits.map((hit) => ({ ...hit })),
      conversations: state.conversations
        .filter((item) => item.courseId === state.selectedCourseId)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((item) => ({ id: item.id, title: item.title })),
      activeConversationId: activeConversation()?.id ?? null,
      conversationTurns: (activeConversation()?.turns ?? []).map((turn) => ({
        ...turn,
        hits: turn.hits.map((hit) => ({ ...hit }))
      })),
      askError: state.lastAskError,
      askOff: state.provider === null,
      activity: state.activity,
      selectedCourseName: selectedCourse?.name ?? null
    }
  }

  async function chooseAppLanguage(language: AppLanguage): Promise<void> {
    state.appLanguage = language
    if (state.outputLanguage === null) {
      state.outputLanguage = language
    }
    if (modelsComplete()) {
      state.gatePassed = true
    }
    emit({ kind: "app" })
  }

  async function configureProvider(
    configOrKind: ProviderConfig | ProviderFieldKind | null,
    vaultOrByKind?: ProviderVault | Partial<Record<ProviderKind, ProviderKindFields>>
  ): Promise<void> {
    if (typeof configOrKind === "string") {
      const byKind = {
        ...providerByKindFromVault(state.providerVault),
        ...(vaultOrByKind ?? {})
      }
      state.providerVault = providerVaultFromFields(byKind)
      state.provider = providerConfigFromFields({ kind: configOrKind, byKind })
      emit({ kind: "app" })
      return
    }
    const config = configOrKind
    const vault = vaultOrByKind as ProviderVault | undefined
    if (vault) {
      state.providerVault = { ...vault }
    } else if (config) {
      const { kind, ...fields } = config
      state.providerVault = { ...state.providerVault, [kind]: fields }
    }
    state.provider = config
    emit({ kind: "app" })
  }

  function neighborVideoId(fromId: string | null, step: 1 | -1): string | null {
    if (!fromId) return null
    const current = state.videos.find((item) => item.id === fromId)
    if (!current) return null
    const session = state.sessions.find((item) => item.id === current.sessionId)
    if (!session) return null
    const inSession = state.videos
      .filter((video) => video.sessionId === current.sessionId)
      .sort((a, b) => a.position - b.position)
    const index = inSession.findIndex((video) => video.id === current.id)
    const neighbor = inSession[index + step]
    if (neighbor) return neighbor.id
    const courseSessions = state.sessions
      .filter((item) => item.courseId === session.courseId)
      .sort((a, b) => a.position - b.position)
    const sessionIndex = courseSessions.findIndex((item) => item.id === session.id)
    const otherSession = courseSessions[sessionIndex + step]
    if (!otherSession) return null
    const otherVideos = state.videos
      .filter((video) => video.sessionId === otherSession.id)
      .sort((a, b) => a.position - b.position)
    return (step === 1 ? otherVideos[0] : otherVideos[otherVideos.length - 1])?.id ?? null
  }

  return {
    snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    chooseAppLanguage,
    async setOutputLanguage(language) {
      assertUsable()
      state.outputLanguage = language
      emit({ kind: "app" })
    },
    configureProvider,
    async setSpokenLanguageDefault(language) {
      state.spokenLanguageDefault = language
      emit({ kind: "app" })
    },
    async updateSettings(patch) {
      assertUsable()
      state.settings = { ...state.settings, ...patch }
      emit({ kind: "app" })
    },
    async updatePrompt(job, prompt) {
      assertUsable()
      state.prompts[job] = prompt
      emit({ kind: "app" })
    },
    async createCourse(name) {
      assertUsable()
      const courseId = id("crs")
      state.courses.push({ id: courseId, name })
      state.selectedCourseId = courseId
      emit()
      return courseId
    },
    async renameCourse(courseId, name) {
      assertUsable()
      const course = state.courses.find((item) => item.id === courseId)
      if (!course) throw new Error("Course not found")
      course.name = name
      emit({ kind: "app" })
    },
    async deleteCourse(courseId) {
      assertUsable()
      const sessionIds = new Set(
        state.sessions.filter((session) => session.courseId === courseId).map((session) => session.id)
      )
      const videoIds = new Set(
        state.videos.filter((video) => sessionIds.has(video.sessionId)).map((video) => video.id)
      )
      state.videos = state.videos.filter((video) => !videoIds.has(video.id))
      state.notes = state.notes.filter((note) => !videoIds.has(note.videoId))
      state.jobs = state.jobs.filter((job) => !videoIds.has(job.videoId))
      for (const videoId of videoIds) {
        delete state.captions[videoId]
        delete state.improvedCaptions[videoId]
        delete state.summaries[videoId]
        delete state.embeddings[videoId]
      }
      state.sessions = state.sessions.filter((session) => session.courseId !== courseId)
      state.courses = state.courses.filter((course) => course.id !== courseId)
      state.conversations = state.conversations.filter((item) => item.courseId !== courseId)
      delete state.activeConversationByCourse[courseId]
      if (state.selectedCourseId === courseId) {
        state.selectedCourseId = state.courses[0]?.id ?? null
        state.selectedVideoId = null
      }
      deleteCourseData(deps.dataDir, courseId)
      emit({ kind: "app" })
    },
    async selectCourse(courseId) {
      assertUsable()
      if (!state.courses.some((course) => course.id === courseId)) {
        throw new Error("Course not found")
      }
      state.selectedCourseId = courseId
      state.selectedVideoId = null
      loadEmbeddingsForCourse(courseId)
      emit({ kind: "app" })
    },
    async createSession(input) {
      assertUsable()
      if (!state.selectedCourseId) throw new Error("No Course selected")
      const position = state.sessions.filter((session) => session.courseId === state.selectedCourseId)
        .length
      const sessionId = id("ses")
      state.sessions.push({
        id: sessionId,
        courseId: state.selectedCourseId,
        name: input.name,
        date: input.date ?? null,
        position
      })
      emit()
      return sessionId
    },
    async renameSession(sessionId, name) {
      assertUsable()
      const session = state.sessions.find((item) => item.id === sessionId)
      if (!session) throw new Error("Session not found")
      session.name = name
      emit()
    },
    async deleteSession(sessionId) {
      assertUsable()
      const session = state.sessions.find((item) => item.id === sessionId)
      if (!session) throw new Error("Session not found")
      const videoIds = state.videos
        .filter((video) => video.sessionId === sessionId)
        .map((video) => video.id)
      for (const videoId of videoIds) removeVideoRecord(videoId)
      state.sessions = state.sessions.filter((item) => item.id !== sessionId)
      state.sessions
        .filter((item) => item.courseId === session.courseId)
        .sort((a, b) => a.position - b.position)
        .forEach((item, index) => {
          item.position = index
        })
      emit()
    },
    async reorderSessions(orderedIds) {
      assertUsable()
      orderedIds.forEach((sessionId, index) => {
        const session = state.sessions.find((item) => item.id === sessionId)
        if (session) session.position = index
      })
      emit()
    },
    async addVideos(input) {
      assertUsable()
      const session = state.sessions.find((item) => item.id === input.sessionId)
      if (!session) throw new Error("Session not found")
      const spokenLanguage = input.spokenLanguage ?? state.spokenLanguageDefault
      const start = state.videos.filter((video) => video.sessionId === input.sessionId).length
      const ids: string[] = []
      for (const [index, path] of input.paths.entries()) {
        const videoId = id("vid")
        ids.push(videoId)
        state.videos.push({
          id: videoId,
          sessionId: input.sessionId,
          path,
          name: basename(path),
          position: start + index,
          spokenLanguage,
          playbackPositionSeconds: 0,
          watched: false,
          fileMissing: !deps.media.exists(path),
          captioningProgress: null,
          hasSummary: false
        })
        const sidecar = deps.media.captionSidecar(path)
        if (sidecar) {
          state.captions[videoId] = captionFromSidecar(deps.media.readText(sidecar))
          afterCaption(videoId)
        } else {
          upsertJob("captioning", videoId)
        }
      }
      kick()
      emit()
      return ids
    },
    async reorderVideos(sessionId, orderedIds) {
      assertUsable()
      orderedIds.forEach((videoId, index) => {
        const video = state.videos.find((item) => item.id === videoId && item.sessionId === sessionId)
        if (video) video.position = index
      })
      emit()
    },
    async moveVideo(videoId, toSessionId) {
      assertUsable()
      const video = state.videos.find((item) => item.id === videoId)
      if (!video) throw new Error("Video not found")
      if (!state.sessions.some((session) => session.id === toSessionId)) {
        throw new Error("Session not found")
      }
      const fromCourseId = courseIdOfVideo(videoId)
      video.sessionId = toSessionId
      video.position = state.videos.filter((item) => item.sessionId === toSessionId && item.id !== videoId)
        .length
      const toCourseId = courseIdOfVideo(videoId)
      if (fromCourseId && toCourseId && fromCourseId !== toCourseId) {
        const rows =
          state.embeddings[videoId] ?? loadCourseEmbeddings(deps.dataDir, fromCourseId)[videoId] ?? []
        saveVideoEmbeddings(deps.dataDir, toCourseId, videoId, rows)
        saveVideoEmbeddings(deps.dataDir, fromCourseId, videoId, [])
        state.embeddings[videoId] = rows
        emit({ kind: "library" })
        return
      }
      emit()
    },
    async deleteVideo(videoId) {
      assertUsable()
      removeVideoRecord(videoId)
      emit()
    },
    async relinkVideo(videoId, path) {
      assertUsable()
      const video = state.videos.find((item) => item.id === videoId)
      if (!video) throw new Error("Video not found")
      video.path = path
      video.name = basename(path)
      video.fileMissing = !deps.media.exists(path)
      emit()
    },
    async relinkFolder(fromDir, toDir) {
      assertUsable()
      const from = fromDir.replace(/[/\\]+$/, "")
      const to = toDir.replace(/[/\\]+$/, "")
      for (const video of state.videos) {
        if (video.path === from || video.path.startsWith(`${from}/`) || video.path.startsWith(`${from}\\`)) {
          video.path = to + video.path.slice(from.length)
          video.name = basename(video.path)
          video.fileMissing = !deps.media.exists(video.path)
        }
      }
      emit({ kind: "library" })
    },
    async selectVideo(videoId) {
      assertUsable()
      const video = state.videos.find((item) => item.id === videoId)
      if (!video) throw new Error("Video not found")
      state.selectedVideoId = videoId
      const session = state.sessions.find((item) => item.id === video.sessionId)
      if (session) {
        state.selectedCourseId = session.courseId
        loadEmbeddingsForCourse(session.courseId)
      }
      emit({ kind: "app" })
    },
    async setPlaybackPosition(seconds) {
      assertUsable()
      const video = selectedVideo()
      video.playbackPositionSeconds = seconds
      emit({ kind: "playback", videoId: video.id })
    },
    async setWatched(videoId, watched) {
      assertUsable()
      const video = state.videos.find((item) => item.id === videoId)
      if (!video) throw new Error("Video not found")
      video.watched = watched
      emit({ kind: "playback", videoId })
    },
    async markEnded() {
      assertUsable()
      const video = selectedVideo()
      if (state.settings.autoMarkWatchedAtEnd) {
        video.watched = true
      }
      emit({ kind: "playback", videoId: video.id })
    },
    nextVideoId(fromId) {
      assertUsable()
      return neighborVideoId(fromId ?? state.selectedVideoId, 1)
    },
    previousVideoId(fromId) {
      assertUsable()
      return neighborVideoId(fromId ?? state.selectedVideoId, -1)
    },
    async selectAdjacent(fromId, direction) {
      assertUsable()
      const id = neighborVideoId(fromId, direction === "next" ? 1 : -1)
      if (!id) return null
      await this.selectVideo(id)
      return id
    },
    async addNote(input) {
      assertUsable()
      const video = selectedVideo()
      const noteId = id("nte")
      state.notes.push({
        id: noteId,
        videoId: video.id,
        text: input.text,
        timestampSeconds: input.timestampSeconds ?? null
      })
      emit()
      return noteId
    },
    async editNote(noteId, text) {
      assertUsable()
      const note = state.notes.find((item) => item.id === noteId)
      if (!note) throw new Error("Note not found")
      note.text = text
      emit()
    },
    search: async (input) => {
      assertUsable()
      const hits = await collectHits(input)
      state.searchHits = hits
      emit({ kind: "app" })
      return hits
    },
    async ask(input) {
      assertUsable()
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
      const allHits = await collectHits({ text: input.question, scope: "course" })
      const { videoHits, sessionHits, courseHits, packedHits } = packAskHits(
        allHits,
        video?.id ?? null,
        video?.sessionId ?? null
      )
      const currentVideoSummary = video ? (state.summaries[video.id] ?? null) : null
      const currentVideoSummaryMissing = Boolean(video) && currentVideoSummary === null
      const sessionSummaries = sessionSummarySnippets(sessionHits, state.summaries)
      const existing = activeConversation()
      const outputLanguage = state.outputLanguage ?? state.appLanguage ?? "fa"
      const budget = state.settings.askContextBudgetTokens ?? 24_000
      const system = state.prompts.ask
      const pack = (turns: ConversationTurn[]): string =>
        JSON.stringify({
          outputLanguage,
          currentVideo: video ? { id: video.id, name: video.name } : null,
          currentSession: session ? { id: session.id, name: session.name } : null,
          currentVideoSummary,
          currentVideoSummaryMissing,
          sessionSummaries,
          hits: { video: videoHits, session: sessionHits, course: courseHits },
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
          { id: id("trn"), kind: "user", text: input.question, hits: [] },
          { id: id("trn"), kind: "assistant", text, hits: cited }
        )
        conversation.updatedAt = Date.now()
        state.lastAskError = null
        persistAsk()
        return { text, hits: cited }
      } catch (error) {
        state.lastAskError = error instanceof Error ? error.message : String(error)
        persistAsk()
        throw error
      }
    },
    async createConversation() {
      assertUsable()
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
      persistAsk()
      return created.id
    },
    async selectConversation(conversationId) {
      assertUsable()
      if (!state.selectedCourseId) throw new Error("No Course selected")
      const conversation = state.conversations.find(
        (item) => item.id === conversationId && item.courseId === state.selectedCourseId
      )
      if (!conversation) throw new Error("Conversation not found")
      state.activeConversationByCourse[state.selectedCourseId] = conversation.id
      persistAsk()
    },
    async renameConversation(conversationId, title) {
      assertUsable()
      const conversation = state.conversations.find((item) => item.id === conversationId)
      if (!conversation) throw new Error("Conversation not found")
      conversation.title = title.trim()
      conversation.updatedAt = Date.now()
      persistAsk(conversation.courseId)
    },
    async deleteConversation(conversationId) {
      assertUsable()
      const conversation = state.conversations.find((item) => item.id === conversationId)
      if (!conversation) throw new Error("Conversation not found")
      const courseId = conversation.courseId
      state.conversations = state.conversations.filter((item) => item.id !== conversationId)
      if (state.activeConversationByCourse[courseId] === conversationId) {
        const next = state.conversations.find((item) => item.courseId === courseId)
        if (next) state.activeConversationByCourse[courseId] = next.id
        else delete state.activeConversationByCourse[courseId]
      }
      persistAsk(courseId)
    },
    async setActivity(activity) {
      assertUsable()
      state.activity = activity
      emit({ kind: "app" })
    },
    async retryJob(jobId) {
      assertUsable()
      const job = state.jobs.find((item) => item.id === jobId)
      if (!job) throw new Error("Job not found")
      job.status = "queued"
      job.error = null
      emit()
      kick()
    },
    async dismissFailedJobs() {
      assertUsable()
      state.jobs = state.jobs.filter((job) => job.status !== "failed")
      emit({ kind: "library" })
    },
    async regenerateCaption(videoId) {
      assertUsable()
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
      upsertJob("captioning", videoId)
      emit()
      kick()
    },
    async generateSummary(videoId) {
      assertUsable()
      if (!state.provider) throw new Error("Provider is not configured")
      const caption = state.captions[videoId]
      if (!caption?.segments.length) throw new Error("No Caption to summarize")
      requestRecall(videoId, "force")
      emitForVideo(videoId)
      kick()
    },
    async generateMissingSummaries() {
      assertUsable()
      if (!state.provider) throw new Error("Provider is not configured")
      const needed = videosNeedingSummary()
      const seen = new Set(missingSummaryQueue)
      for (const videoId of needed) {
        if (!seen.has(videoId)) missingSummaryQueue.push(videoId)
      }
      startNextMissingSummary()
    }
  }
}
