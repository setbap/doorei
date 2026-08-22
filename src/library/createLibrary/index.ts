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
import { bindJobs } from "./jobs.js"
import { recallApi } from "./recallApi.js"
import { collectHits } from "./search.js"
import { settingsApi } from "./settingsApi.js"
import { buildSnapshot, isLightHint, isStructuralHint } from "./snapshot.js"
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
  const state = loaded
  const listeners = new Set<() => void>()
  const core = {
    deps,
    state,
    listeners,
    missingSummaryQueue: [] as string[],
    chain: Promise.resolve(),
    treeEpoch: 0,
    lightSnapshot: false
  } as LibraryCore

  let sessionCache: ReturnType<typeof treeSessions> = []
  let videoCache: ReturnType<typeof treeVideos> = []
  let cachedTreeEpoch = -1

  function cachedTree(): void {
    if (cachedTreeEpoch === core.treeEpoch) return
    sessionCache = treeSessions(state)
    videoCache = treeVideos(state)
    cachedTreeEpoch = core.treeEpoch
  }

  core.notify = () => {
    for (const listener of listeners) listener()
  }

  core.notifyLight = () => {
    core.lightSnapshot = true
    try {
      core.notify()
    } finally {
      core.lightSnapshot = false
    }
  }

  core.persistOnly = (hint) => {
    persistLibrary(deps.dataDir, state, hint)
  }

  function defaultHint(): PersistHint {
    return state.selectedCourseId
      ? { kind: "course", courseId: state.selectedCourseId }
      : { kind: "app" }
  }

  core.emit = (hint) => {
    if (hint !== "ui") {
      persistLibrary(deps.dataDir, state, hint ?? defaultHint())
      if (isStructuralHint(hint)) core.treeEpoch += 1
    }
    if (isLightHint(hint)) core.notifyLight()
    else core.notify()
  }

  core.persistAsk = (courseId = state.selectedCourseId) => {
    if (courseId) {
      persistLibrary(deps.dataDir, state, { kind: "ask", courseId })
      core.notifyLight()
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
    if (state.loadedEmbeddingsCourseId === courseId) return
    state.embeddings = loadCourseEmbeddings(deps.dataDir, courseId)
    state.loadedEmbeddingsCourseId = courseId
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
  core.treeSessions = () => {
    cachedTree()
    return sessionCache
  }
  core.treeVideos = () => {
    cachedTree()
    return videoCache
  }
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
    core.treeEpoch += 1
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
  core.videosInScope = (scope, videoIds) => videosInScope(state, scope, videoIds)
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
