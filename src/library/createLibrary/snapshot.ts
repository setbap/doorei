import { DEFAULT_SETTINGS } from "../defaults.js"
import { REQUIRED_MODELS } from "../models.js"
import type { LibrarySnapshot } from "../types.js"
import type { LibraryCore } from "./core.js"
import { treeSessions, treeVideos } from "./tree.js"

export function buildSnapshot(core: LibraryCore): LibrarySnapshot {
  const { state, deps } = core
  for (const video of state.videos) {
    video.fileMissing = !deps.media.exists(video.path)
  }
  const selected = state.videos.find((video) => video.id === state.selectedVideoId) ?? null
  const selectedCourse = state.courses.find((course) => course.id === state.selectedCourseId) ?? null
  return {
    usable: core.usable(),
    appLanguage: state.appLanguage,
    outputLanguage: state.outputLanguage ?? state.appLanguage ?? "fa",
    direction: core.direction(),
    providerConfigured: state.provider !== null,
    provider: state.provider ? { ...state.provider } : null,
    providerVault: core.vaultForSnapshot(),
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
    sessions: treeSessions(state).map((session) => ({ ...session })),
    videos: treeVideos(state).map((video) => ({
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
    activeConversationId: core.activeConversation()?.id ?? null,
    conversationTurns: (core.activeConversation()?.turns ?? []).map((turn) => ({
      ...turn,
      hits: turn.hits.map((hit) => ({ ...hit }))
    })),
    askError: state.lastAskError,
    askOff: state.provider === null,
    activity: state.activity,
    selectedCourseName: selectedCourse?.name ?? null
  }
}
