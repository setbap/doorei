import { useEffect, useMemo, useState } from "react"
import { Folder, FolderOpen } from "lucide-react"
import {
  applyTreeDrop,
  sessionRowPlacement,
  treeDropCommand,
  videoRowPlacement,
  type TreeDragged,
  type TreeDropTarget
} from "../../../library/treeDrop.js"
import { t } from "../uiText"
import { orderedCourses } from "./orderedCourses"
import { SessionBranch } from "./SessionBranch"
import type { LibraryTreeProps, PlacementFor } from "./types"

const libraryDrop = {
  reorderSessions: (orderedIds: string[]) =>
    window.doorei.call("reorderSessions", orderedIds) as Promise<void>,
  reorderVideos: (sessionId: string, orderedIds: string[]) =>
    window.doorei.call("reorderVideos", sessionId, orderedIds) as Promise<void>,
  moveVideo: (videoId: string, toSessionId: string) =>
    window.doorei.call("moveVideo", videoId, toSessionId) as Promise<void>
}

export function LibraryTree({ snapshot, lang, onAddVideos, onRenameSession, onDeleteSession }: LibraryTreeProps) {
  const [openSessions, setOpenSessions] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    const current = snapshot.videos.find((video) => video.id === snapshot.selectedVideoId)
    if (current) initial.add(current.sessionId)
    else {
      const first = snapshot.sessions.find((session) => session.courseId === snapshot.selectedCourseId)
      if (first) initial.add(first.id)
    }
    return initial
  })
  const [openCourses, setOpenCourses] = useState<Set<string>>(
    () => new Set(snapshot.selectedCourseId ? [snapshot.selectedCourseId] : [])
  )
  const [dragged, setDragged] = useState<TreeDragged | null>(null)
  const [dropTarget, setDropTarget] = useState<TreeDropTarget | null>(null)

  const selected = snapshot.videos.find((video) => video.id === snapshot.selectedVideoId)
  const videosBySession = useMemo(() => {
    const map = new Map<string, typeof snapshot.videos>()
    for (const video of snapshot.videos) {
      const list = map.get(video.sessionId) ?? []
      list.push(video)
      map.set(video.sessionId, list)
    }
    return map
  }, [snapshot.videos])

  useEffect(() => {
    if (!selected) return
    setOpenSessions((prev) => (prev.has(selected.sessionId) ? prev : new Set(prev).add(selected.sessionId)))
    const courseId = snapshot.sessions.find((session) => session.id === selected.sessionId)?.courseId
    if (courseId) {
      setOpenCourses((prev) => (prev.has(courseId) ? prev : new Set(prev).add(courseId)))
    }
  }, [selected?.sessionId, snapshot.sessions])

  function toggleSession(id: string): void {
    setOpenSessions((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleCourse(id: string): void {
    setOpenCourses((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const placementFor: PlacementFor = (event, targetKind) => {
    if (targetKind === "session" && dragged?.kind === "video") return "into"
    const rect = event.currentTarget.getBoundingClientRect()
    const offsetY = event.clientY - rect.top
    if (targetKind === "video" || dragged?.kind === "session") {
      return videoRowPlacement(offsetY, rect.height)
    }
    return sessionRowPlacement(offsetY, rect.height)
  }

  async function commit(target: TreeDropTarget): Promise<void> {
    if (!dragged) return
    const command = treeDropCommand(snapshot, dragged, target)
    setDropTarget(null)
    setDragged(null)
    if (!command) return
    await applyTreeDrop(libraryDrop, command)
    if (command.method === "moveVideo") {
      await window.doorei.call("selectVideo", command.videoId)
    }
  }

  return (
    <>
      {orderedCourses(snapshot).map((course) => {
        const sessions = snapshot.sessions.filter((session) => session.courseId === course.id)
        const selectedCourse = course.id === snapshot.selectedCourseId
        const courseOpen = selectedCourse || openCourses.has(course.id) || dragged?.kind === "video"
        return (
          <div key={course.id} className="mb-1">
            {selectedCourse ? null : (
              <button
                type="button"
                onClick={() => toggleCourse(course.id)}
                className="flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 text-start text-muted-foreground hover:bg-sidebar-accent/60"
              >
                {courseOpen ? <FolderOpen className="size-4 shrink-0" /> : <Folder className="size-4 shrink-0" />}
                <span className="truncate text-sm">{course.name}</span>
              </button>
            )}
            {courseOpen
              ? sessions.map((session) => (
                  <SessionBranch
                    key={session.id}
                    session={session}
                    videos={videosBySession.get(session.id) ?? []}
                    snapshot={snapshot}
                    lang={lang}
                    open={openSessions.has(session.id)}
                    dragged={dragged}
                    dropTarget={dropTarget}
                    onToggle={() => toggleSession(session.id)}
                    onAddVideos={onAddVideos}
                    onRenameSession={() => onRenameSession(session)}
                    onDeleteSession={() => onDeleteSession(session)}
                    onDragged={setDragged}
                    onDropTarget={setDropTarget}
                    placementFor={placementFor}
                    onCommit={commit}
                  />
                ))
              : null}
            {selectedCourse && sessions.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">{t(lang, "noSessions")}</p>
            ) : null}
          </div>
        )
      })}
    </>
  )
}
