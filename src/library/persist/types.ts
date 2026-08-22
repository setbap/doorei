import type {
  Activity,
  AppLanguage,
  Caption,
  ConversationRecord,
  ConversationTurn,
  CourseRecord,
  Hit,
  Job,
  Note,
  PlayerSettings,
  ProviderConfig,
  ProviderVault,
  VideoRecord
} from "../types.js"

export type StoredConversation = ConversationRecord & {
  courseId: string
  updatedAt: number
  turns: ConversationTurn[]
}

export type EmbeddingRow = {
  segmentIndex: number
  vector: number[]
  kind: "caption" | "note"
  noteId?: string
}

export type LibraryState = {
  appLanguage: AppLanguage | null
  provider: ProviderConfig | null
  providerVault: ProviderVault
  settings: PlayerSettings
  selectedCourseId: string | null
  selectedVideoId: string | null
  activity: Activity
  gatePassed: boolean
  courses: CourseRecord[]
  sessions: { id: string; courseId: string; name: string; date: string | null; position: number }[]
  videos: VideoRecord[]
  notes: Note[]
  captions: Record<string, Caption>
  improvedCaptions: Record<string, Caption>
  summaries: Record<string, string>
  embeddings: Record<string, EmbeddingRow[]>
  loadedEmbeddingsCourseId: string | null
  jobs: Job[]
  searchHits: Hit[]
  conversations: StoredConversation[]
  activeConversationByCourse: Record<string, string>
  lastAskError: string | null
}

export type PersistHint =
  | { kind: "library" }
  | { kind: "app" }
  | { kind: "course"; courseId: string }
  | { kind: "playback"; videoId: string }
  | { kind: "ask"; courseId: string }
  | { kind: "captioning"; videoId: string }
  | { kind: "embeddings"; courseId: string; videoId: string }
