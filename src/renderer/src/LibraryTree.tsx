import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, ChevronRight, Folder, FolderOpen, Plus } from "lucide-react"
import type {
  AppLanguage,
  LibrarySnapshot,
  SessionRecord,
  VideoRecord
} from "../../library/types.js"
import {
  applyTreeDrop,
  sessionRowPlacement,
  treeDropCommand,
  videoRowPlacement,
  type TreeDragged,
  type TreeDropTarget
} from "../../library/treeDrop.js"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { t } from "./uiText"

type Props = {
  snapshot: LibrarySnapshot
  lang: AppLanguage
  onAddVideos: (sessionId: string, picker: () => Promise<string[]>) => void
}

const libraryDrop = {
  reorderSessions: (orderedIds: string[]) =>
    window.doorei.call("reorderSessions", orderedIds) as Promise<void>,
  reorderVideos: (sessionId: string, orderedIds: string[]) =>
    window.doorei.call("reorderVideos", sessionId, orderedIds) as Promise<void>,
  moveVideo: (videoId: string, toSessionId: string) =>
    window.doorei.call("moveVideo", videoId, toSessionId) as Promise<void>
}

export function LibraryTree({ snapshot, lang, onAddVideos }: Props) {
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

  function placementFor(
    event: { clientY: number; currentTarget: EventTarget & HTMLElement },
    targetKind: TreeDropTarget["kind"]
  ): TreeDropTarget["placement"] {
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
        const courseOpen =
          selectedCourse || openCourses.has(course.id) || dragged?.kind === "video"
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

function SessionBranch({
  session,
  videos,
  snapshot,
  lang,
  open,
  dragged,
  dropTarget,
  onToggle,
  onAddVideos,
  onDragged,
  onDropTarget,
  placementFor,
  onCommit
}: {
  session: SessionRecord
  videos: VideoRecord[]
  snapshot: LibrarySnapshot
  lang: AppLanguage
  open: boolean
  dragged: TreeDragged | null
  dropTarget: TreeDropTarget | null
  onToggle: () => void
  onAddVideos: Props["onAddVideos"]
  onDragged: (dragged: TreeDragged | null) => void
  onDropTarget: (dropTarget: TreeDropTarget | null) => void
  placementFor: (
    event: { clientY: number; currentTarget: EventTarget & HTMLElement },
    targetKind: TreeDropTarget["kind"]
  ) => TreeDropTarget["placement"]
  onCommit: (target: TreeDropTarget) => Promise<void>
}) {
  const sessionDropTarget = dropTarget?.kind === "session" && dropTarget.id === session.id ? dropTarget.placement : null
  const skipClick = useRef(false)
  return (
    <div className="mb-0.5">
      <div
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move"
          event.dataTransfer.setData("text/plain", session.id)
          skipClick.current = true
          onDragged({ kind: "session", id: session.id })
        }}
        onDragEnd={() => {
          onDragged(null)
          onDropTarget(null)
          window.setTimeout(() => {
            skipClick.current = false
          }, 0)
        }}
        onDragOver={(event) => {
          event.stopPropagation()
          if (!dragged) return
          const placement = placementFor(event, "session")
          const target: TreeDropTarget = { kind: "session", id: session.id, placement }
          if (!treeDropCommand(snapshot, dragged, target)) {
            onDropTarget(null)
            return
          }
          event.preventDefault()
          onDropTarget(target)
        }}
        onDrop={(event) => {
          event.preventDefault()
          event.stopPropagation()
          const placement = placementFor(event, "session")
          void onCommit({ kind: "session", id: session.id, placement })
        }}
        className={cn(
          "group/row flex cursor-grab items-center gap-1 rounded-md pe-1 hover:bg-sidebar-accent/60 active:cursor-grabbing",
          dragged?.kind === "session" && dragged.id === session.id && "opacity-50",
          sessionDropTarget === "before" && "shadow-[inset_0_2px_0_0_var(--sidebar-foreground)]",
          sessionDropTarget === "after" && "shadow-[inset_0_-2px_0_0_var(--sidebar-foreground)]",
          sessionDropTarget === "into" && "bg-sidebar-accent ring-1 ring-sidebar-foreground/40"
        )}
      >
        <button
          type="button"
          onClick={() => {
            if (skipClick.current) return
            onToggle()
          }}
          className="flex min-w-0 flex-1 items-center gap-2 px-1.5 py-1.5 text-start"
        >
          <span className="relative inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground">
            {open ? (
              <FolderOpen className="size-4 transition-opacity group-hover/row:opacity-0" />
            ) : (
              <Folder className="size-4 transition-opacity group-hover/row:opacity-0" />
            )}
            {open ? (
              <ChevronDown className="absolute size-4 opacity-0 transition-opacity group-hover/row:opacity-100" />
            ) : (
              <ChevronRight className="absolute size-4 opacity-0 transition-opacity group-hover/row:opacity-100 rtl:rotate-180" />
            )}
          </span>
          <span className="truncate text-sm">{session.name}</span>
          {session.date ? (
            <span className="shrink-0 text-[0.7rem] text-muted-foreground">{session.date}</span>
          ) : null}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                draggable={false}
                onPointerDown={(event) => event.stopPropagation()}
                className={cn(
                  "shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100 aria-expanded:opacity-100",
                  open && "opacity-70"
                )}
              />
            }
          >
            <Plus />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => onAddVideos(session.id, () => window.doorei.pickVideos())}>
              {t(lang, "addVideos")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onAddVideos(session.id, () => window.doorei.pickFolderVideos())}
            >
              {t(lang, "addFolder")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {open ? (
        <div
          className="mb-1 ms-[1.05rem] border-s ps-2"
          onDragOver={(event) => {
            if (dragged?.kind !== "video") return
            event.stopPropagation()
            const target: TreeDropTarget = { kind: "session", id: session.id, placement: "into" }
            if (!treeDropCommand(snapshot, dragged, target)) {
              onDropTarget(null)
              return
            }
            event.preventDefault()
            onDropTarget(target)
          }}
          onDrop={(event) => {
            if (dragged?.kind !== "video") return
            event.preventDefault()
            event.stopPropagation()
            void onCommit({ kind: "session", id: session.id, placement: "into" })
          }}
        >
          {videos.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">{t(lang, "noVideosInSession")}</p>
          ) : (
            videos.map((video) => {
              const videoHint = dropTarget?.kind === "video" && dropTarget.id === video.id ? dropTarget.placement : null
              return (
                <Button
                  key={video.id}
                  draggable
                  variant={video.id === snapshot.selectedVideoId ? "secondary" : "ghost"}
                  className={cn(
                    "mt-0.5 h-auto w-full cursor-grab justify-between py-1.5 active:cursor-grabbing",
                    dragged?.kind === "video" && dragged.id === video.id && "opacity-50",
                    videoHint === "before" && "shadow-[inset_0_2px_0_0_var(--sidebar-foreground)]",
                    videoHint === "after" && "shadow-[inset_0_-2px_0_0_var(--sidebar-foreground)]"
                  )}
                  onDragStart={(event) => {
                    event.stopPropagation()
                    event.dataTransfer.effectAllowed = "move"
                    event.dataTransfer.setData("text/plain", video.id)
                    skipClick.current = true
                    onDragged({ kind: "video", id: video.id })
                  }}
                  onDragEnd={() => {
                    onDragged(null)
                    onDropTarget(null)
                    window.setTimeout(() => {
                      skipClick.current = false
                    }, 0)
                  }}
                  onDragOver={(event) => {
                    event.stopPropagation()
                    if (!dragged) return
                    const placement = placementFor(event, "video")
                    if (placement === "into") return
                    const target = { kind: "video" as const, id: video.id, placement }
                    if (!treeDropCommand(snapshot, dragged, target)) {
                      onDropTarget(null)
                      return
                    }
                    event.preventDefault()
                    onDropTarget(target)
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    const placement = placementFor(event, "video")
                    if (placement === "into") return
                    void onCommit({ kind: "video", id: video.id, placement })
                  }}
                  onClick={() => {
                    if (skipClick.current) return
                    void window.doorei.call("selectVideo", video.id)
                  }}
                >
                  <span className="truncate">{video.name}</span>
                  <span className="flex items-center gap-1">
                    {video.watched ? <Badge variant="secondary">✓</Badge> : null}
                    {video.fileMissing ? <Badge variant="outline">!</Badge> : null}
                  </span>
                </Button>
              )
            })
          )}
        </div>
      ) : null}
    </div>
  )
}

function orderedCourses(snapshot: LibrarySnapshot) {
  const selected = snapshot.courses.filter((course) => course.id === snapshot.selectedCourseId)
  const others = snapshot.courses.filter((course) => course.id !== snapshot.selectedCourseId)
  return [...selected, ...others]
}
