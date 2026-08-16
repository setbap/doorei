import { useEffect, useRef, useState } from "react"
import type { AppLanguage, LibrarySnapshot } from "../../../library/types.js"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AddNoteFromSelection } from "../AddNoteFromSelection"
import { Markdown } from "../Markdown"
import { t } from "../uiText"

export function SummaryPane({
  snapshot,
  lang
}: {
  snapshot: LibrarySnapshot
  lang: AppLanguage
}) {
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
    return <SummaryMarkdown lang={lang} text={snapshot.summary} />
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
      {snapshot.summary && busy ? <SummaryMarkdown lang={lang} text={snapshot.summary} /> : null}
    </div>
  )
}

function SummaryMarkdown({ lang, text }: { lang: AppLanguage; text: string }) {
  const rootRef = useRef<HTMLDivElement>(null)
  return (
    <div ref={rootRef} className="relative min-h-0 flex-1">
      <ScrollArea className="h-full min-h-0">
        <Markdown text={text} />
      </ScrollArea>
      <AddNoteFromSelection lang={lang} rootRef={rootRef} />
    </div>
  )
}
