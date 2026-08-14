import type { AppLanguage, LibrarySnapshot, SearchScope } from "../../library/types.js"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Input } from "@/components/ui/input"
import { t } from "./uiText"

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
  onEditNote
}: Props) {
  const scopes: SearchScope[] = ["video", "session", "course"]
  const selected = snapshot.videos.find((video) => video.id === snapshot.selectedVideoId)

  async function seekHit(videoId: string, startSeconds: number | null): Promise<void> {
    await window.doorei.call("selectVideo", videoId)
    if (startSeconds != null) {
      await window.doorei.call("setPlaybackPosition", startSeconds)
      onSeek(startSeconds)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <ToggleGroup
        className="mb-3"
        value={[scope]}
        onValueChange={(values) => {
          const next = values[0]
          if (next === "video" || next === "session" || next === "course") setScope(next)
        }}
      >
        {scopes.map((item) => (
          <ToggleGroupItem key={item} value={item} size="sm">
            {t(
              lang,
              item === "video" ? "scopeVideo" : item === "session" ? "scopeSession" : "scopeCourse"
            )}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {snapshot.activity === "search" ? (
        <>
          <Input
            placeholder={t(lang, "searchPlaceholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void window.doorei.call("search", { text: query, scope })
            }}
          />
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
                    <span className="text-start">{hit.text}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </>
      ) : null}
      {snapshot.activity === "ask" ? (
        snapshot.askOff ? (
          <Alert>
            <AlertDescription>{t(lang, "askOff")}</AlertDescription>
          </Alert>
        ) : (
          <>
            <Textarea
              placeholder={t(lang, "askPlaceholder")}
              value={question}
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
                <p className="text-sm">{snapshot.askAnswer.text}</p>
                <ul className="mt-2 space-y-1">
                  {snapshot.askAnswer.hits.map((hit, index) => (
                    <li key={index}>
                      <Button
                        variant="link"
                        className="h-auto px-0 whitespace-normal"
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
      {snapshot.activity === "summary" ? (
        <ScrollArea className="min-h-0 flex-1">
          <p className="whitespace-pre-wrap text-sm leading-6">
            {snapshot.summary ?? t(lang, "noSummary")}
          </p>
        </ScrollArea>
      ) : null}
      {snapshot.activity === "notes" ? (
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
                  <p className="text-sm">{item.text}</p>
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
      {snapshot.selectedVideoId ? (
        <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void window.doorei.call(
                "setWatched",
                snapshot.selectedVideoId,
                !selected?.watched
              )
            }
          >
            {t(lang, "watched")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void window.doorei.call("nextVideoId").then((id) => {
                if (typeof id === "string") void window.doorei.call("selectVideo", id)
              })
            }
          >
            {t(lang, "next")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void window.doorei.call("regenerateCaption", snapshot.selectedVideoId)}
          >
            {t(lang, "regenerate")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (snapshot.selectedVideoId) {
                void window.doorei.call("deleteVideo", snapshot.selectedVideoId)
              }
            }}
          >
            {t(lang, "deleteVideo")}
          </Button>
          {snapshot.jobs
            .filter((job) => job.status === "failed")
            .map((job) => (
              <Button
                key={job.id}
                variant="outline"
                size="sm"
                onClick={() => void window.doorei.call("retryJob", job.id)}
              >
                {t(lang, "retry")}: {job.error}
              </Button>
            ))}
        </div>
      ) : (
        <Separator className="mt-auto" />
      )}
    </div>
  )
}
