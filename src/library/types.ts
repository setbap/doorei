import type { REQUIRED_MODELS } from "./models.js"

export type AppLanguage = "fa" | "en"
export type SpokenLanguage = "fa" | "en"
export type SearchScope = "video" | "session" | "course"
export type Activity = "search" | "ask" | "summary" | "notes" | "captions"
export type CaptionSource = "imported" | "asr"
export type JobKind = "captioning" | "improve" | "summary" | "embed"
export type JobStatus = "queued" | "running" | "complete" | "failed" | "off"
export type ProviderKind = "openai" | "codex" | "opencode" | "cursor"

export type CaptionSegment = {
  startSeconds: number
  endSeconds: number
  text: string
}

export type Caption = {
  source: CaptionSource
  segments: CaptionSegment[]
}

export type ProviderConfig = {
  kind: ProviderKind
  url?: string
  key?: string
}

export type PlayerSettings = {
  autoplay: boolean
  confetti: boolean
  playbackSpeed: number
  subtitlesVisible: boolean
  autoMarkWatchedAtEnd: boolean
  captionColor: string
  captionBackground: string
}

export type HitKind = "caption" | "note"

export type Hit = {
  videoId: string
  sessionId: string
  startSeconds: number | null
  text: string
  kind: HitKind
  score: number
}

export type AskAnswer = {
  text: string
  hits: Hit[]
}

export type Note = {
  id: string
  videoId: string
  text: string
  timestampSeconds: number | null
}

export type VideoRecord = {
  id: string
  sessionId: string
  path: string
  name: string
  position: number
  spokenLanguage: SpokenLanguage
  playbackPositionSeconds: number
  watched: boolean
  fileMissing: boolean
  captioningProgress: number | null
  hasSummary: boolean
}

export type SessionRecord = {
  id: string
  courseId: string
  name: string
  date: string | null
  position: number
}

export type CourseRecord = {
  id: string
  name: string
}

export type Job = {
  id: string
  kind: JobKind
  videoId: string
  status: JobStatus
  progress: number
  error: string | null
}

export type LibrarySnapshot = {
  usable: boolean
  appLanguage: AppLanguage | null
  outputLanguage: AppLanguage
  direction: "rtl" | "ltr"
  providerConfigured: boolean
  provider: ProviderConfig | null
  spokenLanguageDefault: SpokenLanguage
  settings: PlayerSettings
  prompts: { improve: string; summary: string; ask: string }
  requiredModels: { id: (typeof REQUIRED_MODELS)[keyof typeof REQUIRED_MODELS]; complete: boolean }[]
  courses: CourseRecord[]
  selectedCourseId: string | null
  selectedVideoId: string | null
  sessions: SessionRecord[]
  videos: VideoRecord[]
  notes: Note[]
  caption: Caption | null
  improvedCaption: Caption | null
  summary: string | null
  jobs: Job[]
  searchHits: Hit[]
  askAnswer: AskAnswer | null
  askError: string | null
  askOff: boolean
  activity: Activity
  selectedCourseName: string | null
}

export type ModelStore = {
  isComplete(modelId: string): boolean
}

export type MediaFiles = {
  exists(path: string): boolean
  readText(path: string): string
  captionSidecar(videoPath: string): string | null
}

export type SpeechRecognizer = {
  caption(input: {
    modelId: string
    videoPath: string
    onSegment: (segment: CaptionSegment) => void | Promise<void>
    onProgress?: (progress: number) => void | Promise<void>
  }): Promise<void>
}

export type Embedder = {
  embed(texts: string[]): Promise<number[][]>
}

export type ProviderClient = {
  complete(input: { system: string; prompt: string }): Promise<string>
}

export type LibraryDeps = {
  dataDir: string
  modelStore: ModelStore
  media: MediaFiles
  speechRecognizer: SpeechRecognizer
  embedder: Embedder
  providerClient?: ProviderClient
}

export type Library = {
  snapshot(): LibrarySnapshot
  subscribe(listener: () => void): () => void

  chooseAppLanguage(language: AppLanguage): Promise<void>
  setOutputLanguage(language: AppLanguage): Promise<void>
  configureProvider(config: ProviderConfig | null): Promise<void>
  setSpokenLanguageDefault(language: SpokenLanguage): Promise<void>
  updateSettings(patch: Partial<PlayerSettings>): Promise<void>
  updatePrompt(job: "improve" | "summary" | "ask", prompt: string): Promise<void>

  createCourse(name: string): Promise<string>
  renameCourse(id: string, name: string): Promise<void>
  selectCourse(id: string): Promise<void>

  createSession(input: { name: string; date?: string }): Promise<string>
  reorderSessions(orderedIds: string[]): Promise<void>

  addVideos(input: {
    sessionId: string
    paths: string[]
    spokenLanguage?: SpokenLanguage
  }): Promise<string[]>
  reorderVideos(sessionId: string, orderedIds: string[]): Promise<void>
  moveVideo(videoId: string, toSessionId: string): Promise<void>
  deleteVideo(videoId: string): Promise<void>
  relinkVideo(videoId: string, path: string): Promise<void>
  relinkFolder(fromDir: string, toDir: string): Promise<void>

  selectVideo(id: string): Promise<void>
  setPlaybackPosition(seconds: number): Promise<void>
  setWatched(videoId: string, watched: boolean): Promise<void>
  markEnded(): Promise<void>
  nextVideoId(): string | null

  addNote(input: { text: string; timestampSeconds?: number | null }): Promise<string>
  editNote(id: string, text: string): Promise<void>

  search(input: { text: string; scope: SearchScope }): Promise<Hit[]>
  ask(input: { question: string; scope: SearchScope }): Promise<AskAnswer>
  setActivity(activity: Activity): Promise<void>

  retryJob(jobId: string): Promise<void>
  regenerateCaption(videoId: string): Promise<void>
  generateSummary(videoId: string): Promise<void>
  generateMissingSummaries(): Promise<void>
}
