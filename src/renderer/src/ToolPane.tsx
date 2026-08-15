import { useEffect, useRef, useState } from "react"
import { Captions, FileText, MessageSquare, Search, StickyNote } from "lucide-react"
import type {
  Activity,
  AppLanguage,
  CaptionSegment,
  LibrarySnapshot,
  SearchScope
} from "../../library/types.js"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { textDirection } from "../../library/textDirection.js"
import { Markdown } from "./Markdown"
import { t } from "./uiText"

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
      <div className="shrink-0 border-b border-white/10 px-3 pt-3 pb-2.5">
        <ToggleGroup
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
      <div className="flex min-h-0 flex-1 flex-col p-3">
      {activity === "search" ? (
        <>
          <div className="flex gap-2">
            <Input
              className="flex-1"
              placeholder={t(lang, "searchPlaceholder")}
              value={query}
              dir={query.trim() ? textDirection(query) : "auto"}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void window.doorei.call("search", { text: query, scope })
              }}
            />
            <Select
              value={scope}
              items={scopeItems}
              onValueChange={(value) => {
                if (value === "video" || value === "session" || value === "course") setScope(value)
              }}
            >
              <SelectTrigger size="sm" className="w-28 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="video">{scopeItems.video}</SelectItem>
                <SelectItem value="session">{scopeItems.session}</SelectItem>
                <SelectItem value="course">{scopeItems.course}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ScrollArea className="mt-3 min-h-0 flex-1">
            <ul className="space-y-2">
              {snapshot.searchHits.map((hit, index) => (
                <li key={`${hit.videoId}-${index}`}>
                  <Button
                    variant="secondary"
                    className="h-auto w-full flex-col items-start gap-1 whitespace-normal py-2"
                    onClick={() => void seekHit(hit.videoId, hit.startSeconds)}
                  >
                    <span className="text-xs text-muted-foreground">{hit.kind}</span>
                    <span className="w-full text-start" dir={textDirection(hit.text)}>
                      {hit.text}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </>
      ) : null}
      {activity === "ask" ? (
        snapshot.askOff ? (
          <Alert>
            <AlertDescription>{t(lang, "askOff")}</AlertDescription>
          </Alert>
        ) : (
          <>
            <Select
              value={scope}
              items={scopeItems}
              onValueChange={(value) => {
                if (value === "video" || value === "session" || value === "course") setScope(value)
              }}
            >
              <SelectTrigger size="sm" className="mb-2 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="video">{scopeItems.video}</SelectItem>
                <SelectItem value="session">{scopeItems.session}</SelectItem>
                <SelectItem value="course">{scopeItems.course}</SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              placeholder={t(lang, "askPlaceholder")}
              value={question}
              dir={question.trim() ? textDirection(question) : "auto"}
              onChange={(event) => setQuestion(event.target.value)}
            />
            <Button
              className="mt-2"
              onClick={() => void window.doorei.call("ask", { question, scope })}
            >
              {t(lang, "ask")}
            </Button>
            {snapshot.askError ? (
              <Alert variant="destructive" className="mt-2">
                <AlertDescription>{snapshot.askError}</AlertDescription>
              </Alert>
            ) : null}
            {snapshot.askAnswer ? (
              <ScrollArea className="mt-3 min-h-0 flex-1">
                <p className="text-sm" dir={textDirection(snapshot.askAnswer.text)}>
                  {snapshot.askAnswer.text}
                </p>
                <ul className="mt-2 space-y-1">
                  {snapshot.askAnswer.hits.map((hit, index) => (
                    <li key={index}>
                      <Button
                        variant="link"
                        className="h-auto px-0 whitespace-normal"
                        dir={textDirection(hit.text)}
                        onClick={() => void seekHit(hit.videoId, hit.startSeconds)}
                      >
                        {hit.text}
                      </Button>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            ) : null}
          </>
        )
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
        <ScrollArea className="min-h-0 flex-1">
          {snapshot.notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t(lang, "noNotes")}</p>
          ) : (
            <ul className="space-y-2">
              {snapshot.notes.map((item) => (
                <li key={item.id} className="rounded-lg bg-muted/50 px-2 py-2">
                  {item.timestampSeconds != null ? (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto px-0"
                      onClick={() => onSeek(item.timestampSeconds)}
                    >
                      {Math.floor(item.timestampSeconds)}s
                    </Button>
                  ) : null}
                  <p className="text-sm" dir={textDirection(item.text)}>
                    {item.text}
                  </p>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => onEditNote(item.id, item.text)}
                  >
                    {t(lang, "editNote")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      ) : null}
      </div>
    </div>
  )
}

function isActivity(value: string | undefined): value is Activity {
  return (
    value === "search" ||
    value === "ask" ||
    value === "captions" ||
    value === "summary" ||
    value === "notes"
  )
}

function SummaryPane({ snapshot, lang }: { snapshot: LibrarySnapshot; lang: AppLanguage }) {
  const videoId = snapshot.selectedVideoId
  const hasCaption = Boolean((snapshot.improvedCaption ?? snapshot.caption)?.segments.length)
  const pipeline = snapshot.jobs.filter(
    (job) =>
      job.videoId === videoId &&
      (job.kind === "improve" || job.kind === "summary") &&
      (job.status === "queued" || job.status === "running")
  )
  const generating = pipeline.length > 0
  const failed = snapshot.jobs.find(
    (job) =>
      job.videoId === videoId &&
      (job.kind === "improve" || job.kind === "summary") &&
      job.status === "failed"
  )
  const [pending, setPending] = useState(false)
  const [callError, setCallError] = useState<string | null>(null)
  const busy = generating || pending
  const improveJob = pipeline.find((job) => job.kind === "improve")
  const hint = !snapshot.providerConfigured
    ? t(lang, "noSummary")
    : !videoId
      ? t(lang, "noVideo")
      : !hasCaption
        ? t(lang, "noCaptionForSummary")
        : improveJob
          ? t(lang, "summaryImproving")
          : generating || pending
            ? t(lang, "summaryGenerating")
            : t(lang, "noSummaryYet")

  useEffect(() => {
    if (generating || snapshot.summary) setPending(false)
  }, [generating, snapshot.summary])

  async function generate(): Promise<void> {
    if (!videoId) return
    setCallError(null)
    setPending(true)
    try {
      await window.doorei.call("generateSummary", videoId)
    } catch (error) {
      setPending(false)
      setCallError(error instanceof Error ? error.message : String(error))
    }
  }

  if (snapshot.summary && !busy) {
    return (
      <ScrollArea className="min-h-0 flex-1">
        <Markdown text={snapshot.summary} />
      </ScrollArea>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <p className="text-sm text-muted-foreground">{hint}</p>
      {failed?.error || callError ? (
        <Alert variant="destructive">
          <AlertDescription>{callError ?? failed?.error}</AlertDescription>
        </Alert>
      ) : null}
      {snapshot.providerConfigured && videoId && hasCaption ? (
        <Button className="self-start" disabled={busy} onClick={() => void generate()}>
          {busy ? t(lang, "summaryGenerating") : t(lang, "generateSummary")}
        </Button>
      ) : null}
      {snapshot.summary && busy ? (
        <ScrollArea className="min-h-0 flex-1">
          <Markdown text={snapshot.summary} />
        </ScrollArea>
      ) : null}
    </div>
  )
}

function CaptionList({
  lang,
  segments,
  currentTime,
  onSeek
}: {
  lang: AppLanguage
  segments: CaptionSegment[]
  currentTime: number
  onSeek: (seconds: number | null) => void
}) {
  const activeIndex = segments.findIndex(
    (segment) => currentTime >= segment.startSeconds && currentTime <= segment.endSeconds
  )
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [activeIndex])

  if (segments.length === 0) {
    return <p className="text-sm text-muted-foreground">{t(lang, "noCaptions")}</p>
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <ul className="space-y-0.5 pb-2">
        {segments.map((segment, index) => {
          const active = index === activeIndex
          return (
            <li key={`${segment.startSeconds}-${index}`}>
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
                <span
                  className="min-w-0 flex-1 leading-relaxed"
                  dir={textDirection(segment.text)}
                >
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
