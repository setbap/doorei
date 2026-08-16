import { loadCourseEmbeddings, saveVideoEmbeddings } from "../persist/index.js"
import { captionFromSidecar } from "../parseCaption.js"
import type { Library } from "../types.js"
import type { LibraryCore } from "./core.js"
import { basename, id } from "./helpers.js"
import { courseIdOfVideo } from "./tree.js"

export function videosApi(core: LibraryCore): Pick<
  Library,
  | "addVideos"
  | "reorderVideos"
  | "moveVideo"
  | "deleteVideo"
  | "relinkVideo"
  | "relinkFolder"
  | "selectVideo"
  | "setPlaybackPosition"
  | "setWatched"
  | "markEnded"
  | "nextVideoId"
  | "previousVideoId"
  | "selectAdjacent"
> {
  const { state, deps } = core
  return {
    async addVideos(input) {
      core.assertUsable()
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
          core.afterCaption(videoId)
        } else {
          core.upsertJob("captioning", videoId)
        }
      }
      core.kick()
      core.emit()
      return ids
    },
    async reorderVideos(sessionId, orderedIds) {
      core.assertUsable()
      orderedIds.forEach((videoId, index) => {
        const video = state.videos.find((item) => item.id === videoId && item.sessionId === sessionId)
        if (video) video.position = index
      })
      core.emit()
    },
    async moveVideo(videoId, toSessionId) {
      core.assertUsable()
      const video = state.videos.find((item) => item.id === videoId)
      if (!video) throw new Error("Video not found")
      if (!state.sessions.some((session) => session.id === toSessionId)) {
        throw new Error("Session not found")
      }
      const fromCourseId = courseIdOfVideo(state, videoId)
      video.sessionId = toSessionId
      video.position = state.videos.filter((item) => item.sessionId === toSessionId && item.id !== videoId)
        .length
      const toCourseId = courseIdOfVideo(state, videoId)
      if (fromCourseId && toCourseId && fromCourseId !== toCourseId) {
        const rows =
          state.embeddings[videoId] ?? loadCourseEmbeddings(deps.dataDir, fromCourseId)[videoId] ?? []
        saveVideoEmbeddings(deps.dataDir, toCourseId, videoId, rows)
        saveVideoEmbeddings(deps.dataDir, fromCourseId, videoId, [])
        state.embeddings[videoId] = rows
        core.emit({ kind: "library" })
        return
      }
      core.emit()
    },
    async deleteVideo(videoId) {
      core.assertUsable()
      core.removeVideoRecord(videoId)
      core.emit()
    },
    async relinkVideo(videoId, path) {
      core.assertUsable()
      const video = state.videos.find((item) => item.id === videoId)
      if (!video) throw new Error("Video not found")
      video.path = path
      video.name = basename(path)
      video.fileMissing = !deps.media.exists(path)
      core.emit()
    },
    async relinkFolder(fromDir, toDir) {
      core.assertUsable()
      const from = fromDir.replace(/[/\\]+$/, "")
      const to = toDir.replace(/[/\\]+$/, "")
      for (const video of state.videos) {
        if (video.path === from || video.path.startsWith(`${from}/`) || video.path.startsWith(`${from}\\`)) {
          video.path = to + video.path.slice(from.length)
          video.name = basename(video.path)
          video.fileMissing = !deps.media.exists(video.path)
        }
      }
      core.emit({ kind: "library" })
    },
    async selectVideo(videoId) {
      core.assertUsable()
      const video = state.videos.find((item) => item.id === videoId)
      if (!video) throw new Error("Video not found")
      state.selectedVideoId = videoId
      const session = state.sessions.find((item) => item.id === video.sessionId)
      if (session) {
        state.selectedCourseId = session.courseId
        core.loadEmbeddingsForCourse(session.courseId)
      }
      core.emit({ kind: "app" })
    },
    async setPlaybackPosition(seconds) {
      core.assertUsable()
      const video = core.selectedVideo()
      video.playbackPositionSeconds = seconds
      core.emit({ kind: "playback", videoId: video.id })
    },
    async setWatched(videoId, watched) {
      core.assertUsable()
      const video = state.videos.find((item) => item.id === videoId)
      if (!video) throw new Error("Video not found")
      video.watched = watched
      core.emit({ kind: "playback", videoId })
    },
    async markEnded() {
      core.assertUsable()
      const video = core.selectedVideo()
      if (state.settings.autoMarkWatchedAtEnd) {
        video.watched = true
      }
      core.emit({ kind: "playback", videoId: video.id })
    },
    nextVideoId(fromId) {
      core.assertUsable()
      return core.neighborVideoId(fromId ?? state.selectedVideoId, 1)
    },
    previousVideoId(fromId) {
      core.assertUsable()
      return core.neighborVideoId(fromId ?? state.selectedVideoId, -1)
    },
    async selectAdjacent(fromId, direction) {
      core.assertUsable()
      const nextId = core.neighborVideoId(fromId, direction === "next" ? 1 : -1)
      if (!nextId) return null
      await this.selectVideo(nextId)
      return nextId
    }
  }
}
