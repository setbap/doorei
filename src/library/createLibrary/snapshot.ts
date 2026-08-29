import { settingsForCourse } from "../courseSettings.js"
import { DEFAULT_SETTINGS } from "../defaults.js"
import { REQUIRED_MODELS } from "../models.js"
import type { LibrarySnapshot } from "../types.js"
import type { LibraryCore } from "./core.js"

export function buildSnapshot(core: LibraryCore): LibrarySnapshot {
  const { state } = core
  if (!core.lightSnapshot) {
    for (const video of state.videos) {
      video.fileMissing = !core.deps.media.exists(video.path)
    }
  }
  const selected = state.videos.find((video) => video.id === state.selectedVideoId) ?? null
  const selectedCourse = state.courses.find((course) => course.id === state.selectedCourseId) ?? null
  const courseSettings = settingsForCourse(state, state.selectedCourseId)
  return {
    usable: core.usable(),
    appLanguage: state.appLanguage,
    outputLanguage: courseSettings.outputLanguage,
    direction: core.direction(),
    providerConfigured: state.provider !== null,
    provider: state.provider ? { ...state.provider } : null,
    providerVault: core.vaultForSnapshot(),
    spokenLanguageDefault: courseSettings.spokenLanguageDefault,
    settings: { ...DEFAULT_SETTINGS, ...state.settings },
    prompts: { ...courseSettings.prompts },
    requiredModels: Object.values(REQUIRED_MODELS).map((modelId) => ({
      id: modelId,
      complete: core.deps.modelStore.isComplete(modelId)
    })),
    courses: state.courses.map((course) => ({ ...course, prompts: { ...course.prompts } })),
    selectedCourseId: state.selectedCourseId,
    selectedVideoId: state.selectedVideoId,
    sessions: core.treeSessions().map((session) => ({ ...session })),
    videos: core.treeVideos().map((video) => ({
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

export function isLightHint(hint: Parameters<LibraryCore["emit"]>[0]): boolean {
  if (hint === "ui") return true
  if (!hint || typeof hint !== "object") return false
  return (
    hint.kind === "captioning" ||
    hint.kind === "embeddings" ||
    hint.kind === "playback" ||
    hint.kind === "ask"
  )
}

export function isStructuralHint(hint: Parameters<LibraryCore["emit"]>[0]): boolean {
  if (hint === "ui") return false
  if (!hint) return true
  return hint.kind === "course" || hint.kind === "library"
}
