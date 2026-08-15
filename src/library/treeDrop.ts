import type { Library, SessionRecord, VideoRecord } from "./types.js"

export type TreeDragged =
  | { kind: "session"; id: string }
  | { kind: "video"; id: string }

export type TreeDropTarget =
  | { kind: "session"; id: string; placement: "before" | "after" | "into" }
  | { kind: "video"; id: string; placement: "before" | "after" }

export type TreeDropCommand =
  | { method: "reorderSessions"; orderedIds: string[] }
  | { method: "reorderVideos"; sessionId: string; orderedIds: string[] }
  | { method: "moveVideo"; videoId: string; toSessionId: string; orderedIds?: string[] }

export type TreeDropSnapshot = {
  sessions: Pick<SessionRecord, "id" | "courseId">[]
  videos: Pick<VideoRecord, "id" | "sessionId">[]
}

export function treeDropCommand(
  snapshot: TreeDropSnapshot,
  dragged: TreeDragged,
  target: TreeDropTarget
): TreeDropCommand | null {
  if (dragged.kind === "session") return sessionDrop(snapshot, dragged.id, target)
  return videoDrop(snapshot, dragged.id, target)
}

export function sessionRowPlacement(offsetY: number, height: number): "before" | "after" | "into" {
  if (height <= 0) return "into"
  const ratio = offsetY / height
  if (ratio < 0.25) return "before"
  if (ratio > 0.75) return "after"
  return "into"
}

export function videoRowPlacement(offsetY: number, height: number): "before" | "after" {
  if (height <= 0) return "after"
  return offsetY < height / 2 ? "before" : "after"
}

function sessionDrop(
  snapshot: TreeDropSnapshot,
  draggedId: string,
  target: TreeDropTarget
): TreeDropCommand | null {
  if (target.kind !== "session" || target.placement === "into") return null
  const draggedSession = snapshot.sessions.find((session) => session.id === draggedId)
  const targetSession = snapshot.sessions.find((session) => session.id === target.id)
  if (!draggedSession || !targetSession) return null
  if (draggedSession.courseId !== targetSession.courseId) return null
  const courseIds = snapshot.sessions
    .filter((session) => session.courseId === draggedSession.courseId)
    .map((session) => session.id)
  const orderedIds = moveId(courseIds, draggedId, target.id, target.placement)
  if (!orderedIds || sameOrder(courseIds, orderedIds)) return null
  return { method: "reorderSessions", orderedIds }
}

function videoDrop(
  snapshot: TreeDropSnapshot,
  draggedId: string,
  target: TreeDropTarget
): TreeDropCommand | null {
  const draggedVideo = snapshot.videos.find((video) => video.id === draggedId)
  if (!draggedVideo) return null
  if (target.kind === "session") {
    if (draggedVideo.sessionId === target.id) return null
    if (!snapshot.sessions.some((session) => session.id === target.id)) return null
    return { method: "moveVideo", videoId: draggedId, toSessionId: target.id }
  }
  const targetVideo = snapshot.videos.find((video) => video.id === target.id)
  if (!targetVideo) return null
  if (draggedVideo.sessionId === targetVideo.sessionId) {
    const sessionIds = snapshot.videos
      .filter((video) => video.sessionId === draggedVideo.sessionId)
      .map((video) => video.id)
    const orderedIds = moveId(sessionIds, draggedId, target.id, target.placement)
    if (!orderedIds || sameOrder(sessionIds, orderedIds)) return null
    return { method: "reorderVideos", sessionId: draggedVideo.sessionId, orderedIds }
  }
  const destIds = snapshot.videos
    .filter((video) => video.sessionId === targetVideo.sessionId)
    .map((video) => video.id)
  const orderedIds = moveId([...destIds, draggedId], draggedId, target.id, target.placement)
  if (!orderedIds) return null
  return {
    method: "moveVideo",
    videoId: draggedId,
    toSessionId: targetVideo.sessionId,
    orderedIds
  }
}

export async function applyTreeDrop(
  library: Pick<Library, "reorderSessions" | "reorderVideos" | "moveVideo">,
  command: TreeDropCommand
): Promise<void> {
  if (command.method === "reorderSessions") {
    await library.reorderSessions(command.orderedIds)
    return
  }
  if (command.method === "reorderVideos") {
    await library.reorderVideos(command.sessionId, command.orderedIds)
    return
  }
  await library.moveVideo(command.videoId, command.toSessionId)
  if (command.orderedIds) {
    await library.reorderVideos(command.toSessionId, command.orderedIds)
  }
}

function moveId(
  ids: string[],
  draggedId: string,
  targetId: string,
  placement: "before" | "after"
): string[] | null {
  const next = ids.filter((id) => id !== draggedId)
  const targetIndex = next.indexOf(targetId)
  if (targetIndex < 0) return null
  next.splice(placement === "after" ? targetIndex + 1 : targetIndex, 0, draggedId)
  return next
}

function sameOrder(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}
