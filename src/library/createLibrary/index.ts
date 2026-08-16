import { REQUIRED_MODELS } from "../models.js"
import {
  loadCourseEmbeddings,
  loadLibrary,
  persistLibrary,
  saveVideoEmbeddings,
  type PersistHint
} from "../persist/index.js"
import type { Library, LibraryDeps, ProviderVault } from "../types.js"
import type { LibraryCore } from "./core.js"
import { coursesApi } from "./coursesApi.js"
import { migratePrompts } from "./helpers.js"
import { bindJobs } from "./jobs.js"
import { recallApi } from "./recallApi.js"
import { collectHits } from "./search.js"
import { settingsApi } from "./settingsApi.js"
import { buildSnapshot } from "./snapshot.js"
import {
  courseIdOfVideo,
  neighborVideoId,
  recallCaption,
  treeSessions,
  treeVideos,
  videosInScope
} from "./tree.js"
import { videosApi } from "./videosApi.js"

export function createLibrary(deps: LibraryDeps): Library {
  const loaded = loadLibrary(deps.dataDir)
  loaded.prompts = migratePrompts(loaded.prompts)
  const state = loaded
  const listeners = new Set<() => void>()
  const core = {
    deps,
    state,
    listeners,
    missingSummaryQueue: [] as string[],
    chain: Promise.resolve()
  } as LibraryCore

  core.notify = () => {
    for (const listener of listeners) listener()
  }

  function defaultHint(): PersistHint {
    return state.selectedCourseId
      ? { kind: "course", courseId: state.selectedCourseId }
      : { kind: "app" }
  }

  core.emit = (hint) => {
    if (hint !== "ui") {
      persistLibrary(deps.dataDir, state, hint ?? defaultHint())
    }
    core.notify()
  }

  core.persistAsk = (courseId = state.selectedCourseId) => {
    if (courseId) {
      persistLibrary(deps.dataDir, state, { kind: "ask", courseId })
      core.notify()
      return
    }
    core.emit()
  }

  core.courseIdOfVideo = (videoId) => courseIdOfVideo(state, videoId)
  core.emitForVideo = (videoId) => {
    const courseId = core.courseIdOfVideo(videoId)
    core.emit(courseId ? { kind: "course", courseId } : undefined)
  }
  core.loadEmbeddingsForCourse = (courseId) => {
    state.embeddings = loadCourseEmbeddings(deps.dataDir, courseId)
  }
  core.modelsComplete = () =>
    Object.values(REQUIRED_MODELS).every((modelId) => deps.modelStore.isComplete(modelId))
  core.usable = () => {
    if (state.gatePassed) return true
    const ok = state.appLanguage !== null && core.modelsComplete()
    if (ok) state.gatePassed = true
    return ok
  }
  core.direction = () => ((state.appLanguage ?? "fa") === "fa" ? "rtl" : "ltr")
  core.assertUsable = () => {
    if (!core.usable()) {
      throw new Error(
        "Library is unusable until App language is chosen and required models are on disk"
      )
    }
  }
  core.treeSessions = () => treeSessions(state)
  core.treeVideos = () => treeVideos(state)
  core.selectedVideo = () => {
    const video = state.videos.find((item) => item.id === state.selectedVideoId)
    if (!video) throw new Error("No Video selected")
    return video
  }
  core.removeVideoRecord = (videoId) => {
    const courseId = core.courseIdOfVideo(videoId)
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
  core.vaultForSnapshot = (): ProviderVault => {
    const vault: ProviderVault = { ...state.providerVault }
    if (!state.provider) return vault
    const { kind, ...fields } = state.provider
    vault[kind] = { ...vault[kind], ...fields }
    return vault
  }
  core.activeConversation = () => {
    if (!state.selectedCourseId) return null
    const activeId = state.activeConversationByCourse[state.selectedCourseId]
    if (!activeId) return null
    return (
      state.conversations.find(
        (item) => item.id === activeId && item.courseId === state.selectedCourseId
      ) ?? null
    )
  }
  core.recallCaption = (videoId) => recallCaption(state, videoId)
  core.videosInScope = (scope) => videosInScope(state, scope)
  core.neighborVideoId = (fromId, step) => neighborVideoId(state, fromId, step)
  core.collectHits = (input) => collectHits(core, input)

  bindJobs(core)

  for (const job of state.jobs) {
    if (job.status === "running") job.status = "queued"
  }
  core.kick()

  return {
    snapshot: () => buildSnapshot(core),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    ...settingsApi(core),
    ...coursesApi(core),
    ...videosApi(core),
    ...recallApi(core)
  }
}
