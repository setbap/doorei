import { useEffect, useState } from "react"
import { Captions, FileText, MessageSquare, Search, StickyNote } from "lucide-react"
import type { AppLanguage, LibrarySnapshot, SearchScope } from "../../../library/types.js"
import { AskPane } from "../AskPane"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import { t } from "../uiText"
import { CaptionList } from "./CaptionList"
import { isActivity } from "./isActivity"
import { NotesList } from "./NotesList"
import { SearchPane } from "./SearchPane"
import { SummaryPane } from "./SummaryPane"

const ACTIVITIES = [
  ["search", Search],
  ["ask", MessageSquare],
  ["captions", Captions],
  ["summary", FileText],
  ["notes", StickyNote]
] as const

type Props = {
  snapshot: LibrarySnapshot
  lang: AppLanguage
  query: string
  setQuery: (value: string) => void
  question: string
  setQuestion: (value: string) => void
  scope: SearchScope
  setScope: (value: SearchScope) => void
  onSeek: (seconds: number | null) => void
  onEditNote: (id: string, text: string) => void
  currentTime: number
}

export function ToolPane({
  snapshot,
  lang,
  query,
  setQuery,
  question,
  setQuestion,
  scope,
  setScope,
  onSeek,
  onEditNote,
  currentTime
}: Props) {
  const [activity, setActivity] = useState(snapshot.activity)
  const scopeItems = {
    video: t(lang, "scopeVideo"),
    session: t(lang, "scopeSession"),
    course: t(lang, "scopeCourse")
  }

  useEffect(() => {
    setActivity(snapshot.activity)
  }, [snapshot.activity])

  async function seekHit(videoId: string, startSeconds: number | null): Promise<void> {
    await window.doorei.call("selectVideo", videoId)
    if (startSeconds != null) {
      await window.doorei.call("setPlaybackPosition", startSeconds)
      onSeek(startSeconds)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-white/10 px-3 py-1.5">
        <ToggleGroup
          className={"mx-auto"}
          value={[activity]}
          onValueChange={(values) => {
            const next = values[0]
            if (isActivity(next)) {
              setActivity(next)
              void window.doorei.call("setActivity", next)
            }
          }}
        >
          {ACTIVITIES.map(([id, Icon]) => {
            const active = activity === id
            return (
              <ToggleGroupItem
                key={id}
                value={id}
                size="sm"
                aria-label={t(lang, id)}
                title={t(lang, id)}
                className="gap-0 overflow-hidden px-2 transition-colors"
              >
                <Icon />
                <span
                  className={cn(
                    "grid transition-[grid-template-columns] duration-300 ease-out",
                    active ? "grid-cols-[1fr]" : "grid-cols-[0fr]"
                  )}
                >
                  <span className="min-w-0 overflow-hidden">
                    <span
                      className={cn(
                        "inline-block ps-1.5 text-xs font-medium transition-opacity duration-300 ease-out",
                        active ? "opacity-100" : "opacity-0"
                      )}
                    >
                      {t(lang, id)}
                    </span>
                  </span>
                </span>
              </ToggleGroupItem>
            )
          })}
        </ToggleGroup>
      </div>
      <div className={cn("flex min-h-0 flex-1 flex-col", activity === "ask" ? "" : "p-3")}>
        {activity === "search" ? (
          <SearchPane
            snapshot={snapshot}
            lang={lang}
            query={query}
            setQuery={setQuery}
            scope={scope}
            setScope={setScope}
            scopeItems={scopeItems}
            onSeekHit={seekHit}
          />
        ) : null}
        {activity === "ask" ? (
          <AskPane
            snapshot={snapshot}
            lang={lang}
            question={question}
            setQuestion={setQuestion}
            onSeek={onSeek}
          />
        ) : null}
        {activity === "captions" ? (
          <CaptionList
            lang={lang}
            segments={(snapshot.improvedCaption ?? snapshot.caption)?.segments ?? []}
            currentTime={currentTime}
            onSeek={onSeek}
          />
        ) : null}
        {activity === "summary" ? <SummaryPane snapshot={snapshot} lang={lang} /> : null}
        {activity === "notes" ? (
          <NotesList snapshot={snapshot} lang={lang} onSeek={onSeek} onEditNote={onEditNote} />
        ) : null}
      </div>
    </div>
  )
}
