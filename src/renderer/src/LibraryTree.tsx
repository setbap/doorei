import { useEffect, useMemo, useRef, useState, type ComponentType, type MutableRefObject, type ReactNode } from "react"
import { ChevronDown, ChevronRight, Ellipsis, Folder, FolderOpen, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import type {
  AppLanguage,
  Job,
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
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { t } from "./uiText"
import { textDirection } from "../../library/textDirection.js"

type Props = {
  snapshot: LibrarySnapshot
  lang: AppLanguage
  onAddVideos: (sessionId: string, picker: () => Promise<string[]>) => void
  onRenameSession: (session: SessionRecord) => void
  onDeleteSession: (session: SessionRecord) => void
}

const libraryDrop = {
  reorderSessions: (orderedIds: string[]) =>
    window.doorei.call("reorderSessions", orderedIds) as Promise<void>,
  reorderVideos: (sessionId: string, orderedIds: string[]) =>
    window.doorei.call("reorderVideos", sessionId, orderedIds) as Promise<void>,
  moveVideo: (videoId: string, toSessionId: string) =>
    window.doorei.call("moveVideo", videoId, toSessionId) as Promise<void>
}

export function LibraryTree({ snapshot, lang, onAddVideos, onRenameSession, onDeleteSession }: Props) {
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
  onRenameSession,
  onDeleteSession,
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
  onRenameSession: () => void
  onDeleteSession: () => void
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
        <Button
          variant="ghost"
          size="icon-xs"
          draggable={false}
          title={t(lang, "renameSession")}
          aria-label={t(lang, "renameSession")}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onRenameSession}
          className={cn(
            "shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100",
            open && "opacity-70"
          )}
        >
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          draggable={false}
          title={t(lang, "deleteSession")}
          aria-label={t(lang, "deleteSession")}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onDeleteSession}
          className={cn(
            "shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100",
            open && "opacity-70"
          )}
        >
          <Trash2 />
        </Button>
      </div>
      {open ? (
        <div
          className="mb-1 ms-[1.05rem] ps-2"
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
            videos.map((video) => (
              <VideoRow
                key={video.id}
                video={video}
                snapshot={snapshot}
                lang={lang}
                dragged={dragged}
                dropTarget={dropTarget}
                skipClick={skipClick}
                onDragged={onDragged}
                onDropTarget={onDropTarget}
                placementFor={placementFor}
                onCommit={onCommit}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

function VideoRow({
  video,
  snapshot,
  lang,
  dragged,
  dropTarget,
  skipClick,
  onDragged,
  onDropTarget,
  placementFor,
  onCommit
}: {
  video: VideoRecord
  snapshot: LibrarySnapshot
  lang: AppLanguage
  dragged: TreeDragged | null
  dropTarget: TreeDropTarget | null
  skipClick: MutableRefObject<boolean>
  onDragged: (dragged: TreeDragged | null) => void
  onDropTarget: (dropTarget: TreeDropTarget | null) => void
  placementFor: (
    event: { clientY: number; currentTarget: EventTarget & HTMLElement },
    targetKind: TreeDropTarget["kind"]
  ) => TreeDropTarget["placement"]
  onCommit: (target: TreeDropTarget) => Promise<void>
}) {
  const videoHint = dropTarget?.kind === "video" && dropTarget.id === video.id ? dropTarget.placement : null
  const selected = video.id === snapshot.selectedVideoId
  const failedJobs = snapshot.jobs.filter((job) => job.videoId === video.id && job.status === "failed")
  const pipeline = snapshot.jobs.filter(
    (job) =>
      job.videoId === video.id &&
      (job.kind === "improve" || job.kind === "summary") &&
      (job.status === "queued" || job.status === "running")
  )
  const spinJob =
    pipeline.find((job) => job.status === "running") ??
    pipeline.find((job) => job.kind === "improve") ??
    pipeline[0]
  const spinKind = spinJob?.kind
  const hasSummary =
    video.hasSummary ||
    (video.id === snapshot.selectedVideoId && Boolean(snapshot.summary)) ||
    snapshot.jobs.some(
      (job) => job.videoId === video.id && job.kind === "summary" && job.status === "complete"
    )
  return (
    <ContextMenu>
      <ContextMenuTrigger
        className={cn(
          "group/video mt-0.5 flex items-center gap-0.5 rounded-md pe-0.5",
          dragged?.kind === "video" && dragged.id === video.id && "opacity-50",
          videoHint === "before" && "shadow-[inset_0_2px_0_0_var(--sidebar-foreground)]",
          videoHint === "after" && "shadow-[inset_0_-2px_0_0_var(--sidebar-foreground)]"
        )}
      >
        <Button
          draggable
          variant="ghost"
          className={cn(
            "h-auto min-w-0 flex-1 cursor-grab justify-between py-1.5 active:cursor-grabbing",
            selected && "bg-secondary",
            hasSummary
              ? "text-foreground hover:text-foreground"
              : "text-muted-foreground hover:text-muted-foreground"
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
          <span className="truncate" dir={textDirection(video.name)}>
            {video.name}
          </span>
          <span className="flex items-center gap-1">
            {spinKind ? (
              <Loader2
                className={cn(
                  "size-3.5 shrink-0 animate-spin",
                  spinKind === "improve" ? "text-orange-400" : "text-emerald-400"
                )}
                aria-label={
                  spinKind === "improve" ? t(lang, "summaryImproving") : t(lang, "summaryGenerating")
                }
              />
            ) : null}
            {video.watched ? <Badge variant="secondary">✓</Badge> : null}
            {video.fileMissing ? <Badge variant="outline">!</Badge> : null}
          </span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                draggable={false}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                className={cn(
                  "shrink-0 opacity-0 transition-opacity group-hover/video:opacity-100 aria-expanded:opacity-100 focus-visible:border-transparent focus-visible:bg-muted focus-visible:opacity-100 focus-visible:ring-0",
                  selected && "opacity-70"
                )}
              />
            }
          >
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <VideoActionItems
              video={video}
              lang={lang}
              failedJobs={failedJobs}
              providerConfigured={snapshot.providerConfigured}
              Item={DropdownMenuItem}
              CheckboxItem={DropdownMenuCheckboxItem}
              Separator={DropdownMenuSeparator}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-44">
        <VideoActionItems
          video={video}
          lang={lang}
          failedJobs={failedJobs}
          providerConfigured={snapshot.providerConfigured}
          Item={ContextMenuItem}
          CheckboxItem={ContextMenuCheckboxItem}
          Separator={ContextMenuSeparator}
        />
      </ContextMenuContent>
    </ContextMenu>
  )
}

function VideoActionItems({
  video,
  lang,
  failedJobs,
  providerConfigured,
  Item,
  CheckboxItem,
  Separator
}: {
  video: VideoRecord
  lang: AppLanguage
  failedJobs: Job[]
  providerConfigured: boolean
  Item: ComponentType<{
    variant?: "default" | "destructive"
    disabled?: boolean
    onClick?: () => void
    children?: ReactNode
  }>
  CheckboxItem: ComponentType<{
    checked?: boolean
    onCheckedChange?: (checked: boolean) => void
    children?: ReactNode
  }>
  Separator: ComponentType
}) {
  return (
    <>
      <CheckboxItem
        checked={video.watched}
        onCheckedChange={(checked) => {
          void window.doorei.call("setWatched", video.id, checked === true)
        }}
      >
        {t(lang, "watched")}
      </CheckboxItem>
      {video.watched ? (
        <Item onClick={() => void window.doorei.call("setWatched", video.id, false)}>
          {t(lang, "unwatched")}
        </Item>
      ) : null}
      <Item
        onClick={() => {
          void window.doorei.call("selectAdjacent", video.id, "previous")
        }}
      >
        {t(lang, "previous")}
      </Item>
      <Item
        onClick={() => {
          void window.doorei.call("selectAdjacent", video.id, "next")
        }}
      >
        {t(lang, "next")}
      </Item>
      <Item onClick={() => void window.doorei.call("regenerateCaption", video.id)}>
        {t(lang, "regenerate")}
      </Item>
      <Item
        disabled={!providerConfigured}
        onClick={() => void window.doorei.call("generateSummary", video.id)}
      >
        {t(lang, "generateSummary")}
      </Item>
      {failedJobs.map((job) => (
        <Item key={job.id} onClick={() => void window.doorei.call("retryJob", job.id)}>
          {t(lang, "retry")}
          {job.error ? `: ${job.error}` : ""}
        </Item>
      ))}
      <Separator />
      <Item variant="destructive" onClick={() => void window.doorei.call("deleteVideo", video.id)}>
        {t(lang, "deleteVideo")}
      </Item>
    </>
  )
}

function orderedCourses(snapshot: LibrarySnapshot) {
  const selected = snapshot.courses.filter((course) => course.id === snapshot.selectedCourseId)
  const others = snapshot.courses.filter((course) => course.id !== snapshot.selectedCourseId)
  return [...selected, ...others]
}
