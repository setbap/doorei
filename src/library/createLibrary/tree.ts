import type { Caption, SearchScope, VideoRecord } from "../types.js"
import type { LibraryState } from "../persist/index.js"

export function courseIdOfVideo(state: LibraryState, videoId: string): string | null {
  const video = state.videos.find((item) => item.id === videoId)
  if (!video) return null
  return state.sessions.find((session) => session.id === video.sessionId)?.courseId ?? null
}

export function treeSessions(state: LibraryState): LibraryState["sessions"] {
  return state.sessions.slice().sort((a, b) => {
    const courseA = state.courses.findIndex((course) => course.id === a.courseId)
    const courseB = state.courses.findIndex((course) => course.id === b.courseId)
    if (courseA !== courseB) return courseA - courseB
    return a.position - b.position
  })
}

export function treeVideos(state: LibraryState): VideoRecord[] {
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

export function recallCaption(state: LibraryState, videoId: string): Caption | null {
  return state.improvedCaptions[videoId] ?? state.captions[videoId] ?? null
}

export function videosInScope(
  state: LibraryState,
  scope: SearchScope,
  videoIds?: string[]
): VideoRecord[] {
  let videos: VideoRecord[]
  if (scope === "video") {
    const video = state.videos.find((item) => item.id === state.selectedVideoId)
    videos = video ? [video] : []
  } else if (scope === "session") {
    const video = state.videos.find((item) => item.id === state.selectedVideoId)
    videos = video ? state.videos.filter((item) => item.sessionId === video.sessionId) : []
  } else if (!state.selectedCourseId) {
    videos = []
  } else {
    const sessionIds = new Set(
      state.sessions
        .filter((session) => session.courseId === state.selectedCourseId)
        .map((session) => session.id)
    )
    videos = state.videos.filter((video) => sessionIds.has(video.sessionId))
  }
  if (!videoIds || videoIds.length === 0) return videos
  const allowed = new Set(videoIds)
  return videos.filter((video) => allowed.has(video.id))
}

export function neighborVideoId(
  state: LibraryState,
  fromId: string | null,
  step: 1 | -1
): string | null {
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
