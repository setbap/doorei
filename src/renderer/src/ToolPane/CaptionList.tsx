import { useEffect, useRef } from "react"
import type { AppLanguage, CaptionSegment } from "../../../library/types.js"
import { activeCaptionIndex } from "../../../library/captionLookup.js"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { textDirection } from "../../../library/textDirection.js"
import { t } from "../uiText"
import { usePlaybackTime } from "../playbackClock"

export function CaptionList({
  lang,
  segments,
  onSeek
}: {
  lang: AppLanguage
  segments: CaptionSegment[]
  onSeek: (seconds: number | null) => void
}) {
  const currentTime = usePlaybackTime()
  const activeIndex = activeCaptionIndex(segments, currentTime)
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" })
  }, [activeIndex])

  if (segments.length === 0) {
    return <p className="text-sm text-muted-foreground">{t(lang, "noCaptions")}</p>
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <ul className="space-y-0.5 pb-2" data-selectable>
        {segments.map((segment, index) => {
          const active = index === activeIndex
          return (
            <li
              key={`${segment.startSeconds}-${index}`}
              className="[content-visibility:auto] [contain-intrinsic-size:auto_3.25rem]"
            >
              <button
                type="button"
                ref={active ? activeRef : undefined}
                className={cn(
                  "flex w-full gap-2 rounded-lg px-2 py-1.5 text-start text-sm transition-colors",
                  active
                    ? "bg-white/10 text-foreground"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
                onClick={() => onSeek(segment.startSeconds)}
              >
                <span className="w-10 shrink-0 pt-0.5 font-medium text-white/45 tabular-nums" dir="ltr">
                  {formatCaptionTime(segment.startSeconds)}
                </span>
                <span className="min-w-0 flex-1 leading-relaxed" dir={textDirection(segment.text)}>
                  {segment.text}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </ScrollArea>
  )
}

function formatCaptionTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const total = Math.floor(seconds)
  const minutes = Math.floor(total / 60)
  const secs = total % 60
  return `${minutes}:${String(secs).padStart(2, "0")}`
}
