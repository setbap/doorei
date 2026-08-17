import { useRef } from "react"
import { ChevronDown, ChevronRight, Folder, FolderOpen, Pencil, Plus, Trash2 } from "lucide-react"
import type { AppLanguage, LibrarySnapshot, SessionRecord, VideoRecord } from "../../../library/types.js"
import { treeDropCommand, type TreeDropTarget } from "../../../library/treeDrop.js"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { Hint } from "../Hint"
import { t } from "../uiText"
import type { LibraryTreeProps, TreeHandlers } from "./types"
import { VideoRow } from "./VideoRow"

export function SessionBranch({
  session,
  videos,
  snapshot,
  lang,
  open,
  onToggle,
  onAddVideos,
  onRenameSession,
  onDeleteSession,
  dragged,
  dropTarget,
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
  onToggle: () => void
  onAddVideos: LibraryTreeProps["onAddVideos"]
  onRenameSession: () => void
  onDeleteSession: () => void
} & TreeHandlers) {
  const sessionDropTarget =
    dropTarget?.kind === "session" && dropTarget.id === session.id ? dropTarget.placement : null
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
                aria-label={t(lang, "addVideos")}
                title={t(lang, "addVideos")}
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
        <Hint
          label={t(lang, "renameSession")}
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              draggable={false}
              aria-label={t(lang, "renameSession")}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={onRenameSession}
              className={cn(
                "shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100",
                open && "opacity-70"
              )}
            />
          }
        >
          <Pencil />
        </Hint>
        <Hint
          label={t(lang, "deleteSession")}
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              draggable={false}
              aria-label={t(lang, "deleteSession")}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={onDeleteSession}
              className={cn(
                "shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100",
                open && "opacity-70"
              )}
            />
          }
        >
          <Trash2 />
        </Hint>
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
