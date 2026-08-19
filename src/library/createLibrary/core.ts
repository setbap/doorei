import type { Caption, Hit, Job, LibraryDeps, SearchScope, VideoRecord } from "../types.js"
import type { LibraryState, PersistHint, StoredConversation } from "../persist/index.js"

export type LibraryCore = {
  deps: LibraryDeps
  state: LibraryState
  listeners: Set<() => void>
  missingSummaryQueue: string[]
  chain: Promise<void>
  notify(): void
  emit(hint?: PersistHint | "ui"): void
  persistAsk(courseId?: string | null): void
  emitForVideo(videoId: string): void
  courseIdOfVideo(videoId: string): string | null
  loadEmbeddingsForCourse(courseId: string): void
  modelsComplete(): boolean
  usable(): boolean
  assertUsable(): void
  selectedVideo(): VideoRecord
  removeVideoRecord(videoId: string): void
  vaultForSnapshot(): import("../types.js").ProviderVault
  direction(): "rtl" | "ltr"
  treeSessions(): LibraryState["sessions"]
  treeVideos(): VideoRecord[]
  kick(): void
  upsertJob(kind: Job["kind"], videoId: string): Job
  afterCaption(videoId: string): void
  requestRecall(videoId: string, mode: "force" | "missing"): void
  afterImprove(videoId: string, outcome: "ok" | "failed" | "off"): void
  finishMissingSummary(videoId: string): void
  startNextMissingSummary(): void
  videosNeedingSummary(): string[]
  collectHits(input: { text: string; scope: SearchScope; videoIds?: string[] }): Promise<Hit[]>
  activeConversation(): StoredConversation | null
  neighborVideoId(fromId: string | null, step: 1 | -1): string | null
  recallCaption(videoId: string): Caption | null
  videosInScope(scope: SearchScope, videoIds?: string[]): VideoRecord[]
}
