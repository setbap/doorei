import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { jsonrepair } from "jsonrepair"
import { REQUIRED_MODELS } from "./models.js"
import { captionFromSidecar } from "./parseCaption.js"
import type {
  Activity,
  AppLanguage,
  AskAnswer,
  Caption,
  CaptionSegment,
  Hit,
  Job,
  Library,
  LibraryDeps,
  LibrarySnapshot,
  Note,
  PlayerSettings,
  ProviderConfig,
  SearchScope,
  SpokenLanguage,
  VideoRecord
} from "./types.js"

const DEFAULT_PROMPTS = {
  improve:
    "Rewrite this Caption with corrected wording. Keep the same Spoken language. Fix technical terms. Return only a JSON array of strings in the same order, one rewritten text per input. Do not change the number of items. Do not include timestamps.",
  summary:
    "Write a Summary of this Video in the requested Output language so the learner can re-read what it covered without watching. Use Markdown (headings, lists, bold). Return only the Markdown, with no wrapping code fence.",
  ask: "Answer the question using only the provided Hits. Cite those Hits. Write in the requested Output language."
}

const LEGACY_IMPROVE_PROMPT =
  "Rewrite this Caption with corrected wording. Keep the same timestamps and the same Spoken language. Fix technical terms. Return only a JSON array of {startSeconds, endSeconds, text}."

const IMPROVE_CHUNK_SEGMENTS = 32
const IMPROVE_CHUNK_CHARS = 4000

const DEFAULT_SETTINGS: PlayerSettings = {
  autoplay: false,
  confetti: false,
  playbackSpeed: 1,
  subtitlesVisible: true,
  autoMarkWatchedAtEnd: true,
  captionColor: "#ffffff",
  captionBackground: "#000000b8"
}

type State = {
  appLanguage: AppLanguage | null
  outputLanguage: AppLanguage | null
  provider: ProviderConfig | null
  spokenLanguageDefault: SpokenLanguage
  settings: PlayerSettings
  prompts: { improve: string; summary: string; ask: string }
  selectedCourseId: string | null
  selectedVideoId: string | null
  activity: Activity
  gatePassed: boolean
  courses: { id: string; name: string }[]
  sessions: { id: string; courseId: string; name: string; date: string | null; position: number }[]
  videos: VideoRecord[]
  notes: Note[]
  captions: Record<string, Caption>
  improvedCaptions: Record<string, Caption>
  summaries: Record<string, string>
  embeddings: Record<string, { segmentIndex: number; vector: number[]; kind: "caption" | "note"; noteId?: string }[]>
  jobs: Job[]
  searchHits: Hit[]
  askAnswer: AskAnswer | null
  lastAskError: string | null
}

function initialState(): State {
  return {
    appLanguage: null,
    outputLanguage: null,
    provider: null,
    spokenLanguageDefault: "fa",
    settings: { ...DEFAULT_SETTINGS },
    prompts: { ...DEFAULT_PROMPTS },
    selectedCourseId: null,
    selectedVideoId: null,
    activity: "summary",
    gatePassed: false,
    courses: [],
    sessions: [],
    videos: [],
    notes: [],
    captions: {},
    improvedCaptions: {},
    summaries: {},
    embeddings: {},
    jobs: [],
    searchHits: [],
    askAnswer: null,
    lastAskError: null
  }
}

function loadState(dataDir: string): State {
  try {
    const raw = readFileSync(join(dataDir, "library.json"), "utf8")
    const loaded = JSON.parse(raw) as Partial<State>
    return {
      ...initialState(),
      ...loaded,
      settings: { ...DEFAULT_SETTINGS, ...loaded.settings },
      prompts: migratePrompts(loaded.prompts)
    }
  } catch {
    return initialState()
  }
}

function saveState(dataDir: string, state: State): void {
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(join(dataDir, "library.json"), JSON.stringify(state), "utf8")
}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

function basename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path
}

function unwrapFence(text: string): string {
  const trimmed = text.trim()
  const fenced = /^```(?:json|markdown|md)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed)
  return (fenced ? fenced[1] : trimmed).trim()
}

function migratePrompts(
  loaded: Partial<State["prompts"]> | undefined
): State["prompts"] {
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

function parseImprovedTexts(raw: string): string[] {
  return parseJsonArray(raw).map((item, index) => {
    if (typeof item === "string") return item
    if (item && typeof item === "object" && "text" in item) {
      const text = (item as { text: unknown }).text
      if (typeof text === "string") return text
    }
    throw new Error(`Provider returned invalid Improved Caption at ${index}`)
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

  function emit(): void {
    saveState(deps.dataDir, state)
    for (const listener of listeners) listener()
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
        if (item.kind === "note" && item.noteId) {
          const note = state.notes.find((candidate) => candidate.id === item.noteId)
          if (!note) continue
          const key = `note:${video.id}:${note.timestampSeconds}:${note.text}`
          if (seen.has(key)) continue
          seen.add(key)
          hits.push({
            videoId: video.id,
            sessionId: video.sessionId,
            startSeconds: note.timestampSeconds,
            text: note.text,
            kind: "note",
            score
          })
        }
      }
    }
    return hits
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
      const busy = state.jobs.some(
        (job) =>
          job.videoId === videoId &&
          (job.kind === "improve" || job.kind === "summary") &&
          (job.status === "queued" || job.status === "running")
      )
      if (busy) return
      upsertJob("improve", videoId)
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
          state.jobs.find((item) => item.status === "queued")
        if (!job) return
        job.status = "running"
        emit()
        try {
          if (job.kind === "captioning") await runCaptioning(job)
          else if (job.kind === "embed") await runEmbed(job)
          else if (job.kind === "improve") await runImprove(job)
          else if (job.kind === "summary") await runSummary(job)
        } catch (error) {
          job.status = "failed"
          job.error = error instanceof Error ? error.message : String(error)
          emit()
          if (job.kind === "improve" && (state.captions[job.videoId]?.segments.length ?? 0) > 0) {
            upsertJob("summary", job.videoId)
          } else if (job.kind === "improve" || job.kind === "summary") {
            finishMissingSummary(job.videoId)
          }
        }
        if (state.jobs.some((item) => item.status === "queued")) kick()
      })
  }

  function afterCaption(videoId: string): void {
    upsertJob("embed", videoId)
    if (state.provider) {
      upsertJob("improve", videoId)
    }
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
        emit()
      }
    })
    if (job.status === "failed") return
    job.status = "complete"
    job.progress = 1
    video.captioningProgress = 1
    emit()
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
    job.status = "complete"
    job.progress = 1
    emit()
  }

  async function runImprove(job: Job): Promise<void> {
    if (!state.provider) {
      job.status = "off"
      emit()
      finishMissingSummary(job.videoId)
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
      emit()
      const raw = await deps.providerClient.complete({
        system: state.prompts.improve,
        prompt: `Spoken language: ${video.spokenLanguage}\nRewrite these Caption texts as JSON. Return a JSON array of strings, same order, same count.\n${JSON.stringify(chunk.map((segment) => segment.text))}`
      })
      let texts: string[]
      try {
        texts = parseImprovedTexts(raw)
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
      emit()
      upsertJob("summary", job.videoId)
      kick()
      return
    }
    state.improvedCaptions[job.videoId] = { source: caption.source, segments: improved }
    job.status = "complete"
    job.progress = 1
    emit()
    upsertJob("summary", job.videoId)
    upsertJob("embed", job.videoId)
    kick()
  }

  async function runSummary(job: Job): Promise<void> {
    if (!state.provider) {
      job.status = "off"
      emit()
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
        prompt: `Output language: ${outputLanguage}\n${JSON.stringify(caption.segments)}`
      })
    )
    if (!text) throw new Error("Provider returned an empty Summary")
    state.summaries[job.videoId] = text
    job.status = "complete"
    job.progress = 1
    emit()
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
      askAnswer: state.askAnswer,
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
    emit()
  }

  async function configureProvider(config: ProviderConfig | null): Promise<void> {
    state.provider = config
    emit()
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
      emit()
    },
    configureProvider,
    async setSpokenLanguageDefault(language) {
      state.spokenLanguageDefault = language
      emit()
    },
    async updateSettings(patch) {
      assertUsable()
      state.settings = { ...state.settings, ...patch }
      emit()
    },
    async updatePrompt(job, prompt) {
      assertUsable()
      state.prompts[job] = prompt
      emit()
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
      emit()
    },
    async selectCourse(courseId) {
      assertUsable()
      if (!state.courses.some((course) => course.id === courseId)) {
        throw new Error("Course not found")
      }
      state.selectedCourseId = courseId
      state.selectedVideoId = null
      emit()
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
      video.sessionId = toSessionId
      video.position = state.videos.filter((item) => item.sessionId === toSessionId && item.id !== videoId)
        .length
      emit()
    },
    async deleteVideo(videoId) {
      assertUsable()
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
      emit()
    },
    async selectVideo(videoId) {
      assertUsable()
      const video = state.videos.find((item) => item.id === videoId)
      if (!video) throw new Error("Video not found")
      state.selectedVideoId = videoId
      const session = state.sessions.find((item) => item.id === video.sessionId)
      if (session) state.selectedCourseId = session.courseId
      emit()
    },
    async setPlaybackPosition(seconds) {
      assertUsable()
      const video = selectedVideo()
      video.playbackPositionSeconds = seconds
      emit()
    },
    async setWatched(videoId, watched) {
      assertUsable()
      const video = state.videos.find((item) => item.id === videoId)
      if (!video) throw new Error("Video not found")
      video.watched = watched
      emit()
    },
    async markEnded() {
      assertUsable()
      const video = selectedVideo()
      if (state.settings.autoMarkWatchedAtEnd) {
        video.watched = true
      }
      emit()
    },
    nextVideoId() {
      assertUsable()
      if (!state.selectedVideoId) return null
      const current = state.videos.find((item) => item.id === state.selectedVideoId)
      if (!current) return null
      const session = state.sessions.find((item) => item.id === current.sessionId)
      if (!session) return null
      const inSession = state.videos
        .filter((video) => video.sessionId === current.sessionId)
        .sort((a, b) => a.position - b.position)
      const index = inSession.findIndex((video) => video.id === current.id)
      if (index >= 0 && index < inSession.length - 1) {
        return inSession[index + 1]?.id ?? null
      }
      const courseSessions = state.sessions
        .filter((item) => item.courseId === session.courseId)
        .sort((a, b) => a.position - b.position)
      const sessionIndex = courseSessions.findIndex((item) => item.id === session.id)
      const nextSession = courseSessions[sessionIndex + 1]
      if (!nextSession) return null
      const nextVideos = state.videos
        .filter((video) => video.sessionId === nextSession.id)
        .sort((a, b) => a.position - b.position)
      return nextVideos[0]?.id ?? null
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
      emit()
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
      const hits = await collectHits({ text: input.question, scope: input.scope })
      const outputLanguage = state.outputLanguage ?? state.appLanguage ?? "fa"
      try {
        const raw = await deps.providerClient.complete({
          system: state.prompts.ask,
          prompt: `Output language: ${outputLanguage}\nQuestion: ${input.question}\nHits: ${JSON.stringify(hits)}`
        })
        let text = raw
        let cited = hits
        try {
          const parsed = JSON.parse(raw) as { text?: string; hitIndexes?: number[] }
          if (typeof parsed.text === "string") {
            text = parsed.text
            if (Array.isArray(parsed.hitIndexes)) {
              cited = parsed.hitIndexes
                .map((index) => hits[index])
                .filter((hit): hit is Hit => hit !== undefined)
            }
          }
        } catch {
          /* raw prose answer */
        }
        const answer = { text, hits: cited }
        state.askAnswer = answer
        state.lastAskError = null
        emit()
        return answer
      } catch (error) {
        state.lastAskError = error instanceof Error ? error.message : String(error)
        emit()
        throw error
      }
    },
    async setActivity(activity) {
      assertUsable()
      state.activity = activity
      emit()
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
    async regenerateCaption(videoId) {
      assertUsable()
      delete state.captions[videoId]
      delete state.improvedCaptions[videoId]
      const video = state.videos.find((item) => item.id === videoId)
      if (video) video.captioningProgress = 0
      upsertJob("captioning", videoId)
      emit()
      kick()
    },
    async generateSummary(videoId) {
      assertUsable()
      if (!state.provider) throw new Error("Provider is not configured")
      const caption = state.captions[videoId]
      if (!caption?.segments.length) throw new Error("No Caption to summarize")
      upsertJob("improve", videoId)
      emit()
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
