import { join } from "node:path"
import type { LibraryState } from "./types.js"

export function appPath(dataDir: string): string {
  return join(dataDir, "app.sqlite")
}

export function coursePath(dataDir: string, courseId: string): string {
  return join(dataDir, "courses", courseId, "course.sqlite")
}

export function jsonPath(dataDir: string): string {
  return join(dataDir, "library.json")
}

export function courseIdForVideo(state: LibraryState, videoId: string): string | null {
  const video = state.videos.find((item) => item.id === videoId)
  if (!video) return null
  return state.sessions.find((session) => session.id === video.sessionId)?.courseId ?? null
}
