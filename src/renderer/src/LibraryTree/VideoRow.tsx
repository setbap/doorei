import type { MutableRefObject } from "react"
import { Ellipsis, Loader2 } from "lucide-react"
import type { AppLanguage, LibrarySnapshot, VideoRecord } from "../../../library/types.js"
import { treeDropCommand } from "../../../library/treeDrop.js"
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
import { t } from "../uiText"
import { textDirection } from "../../../library/textDirection.js"
import { VideoActionItems } from "./VideoActionItems"
import type { TreeHandlers } from "./types"

export function VideoRow({
  video,
  snapshot,
  lang,
  skipClick,
  dragged,
  dropTarget,
  onDragged,
  onDropTarget,
  placementFor,
  onCommit
}: {
  video: VideoRecord
  snapshot: LibrarySnapshot
  lang: AppLanguage
  skipClick: MutableRefObject<boolean>
} & TreeHandlers) {
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
