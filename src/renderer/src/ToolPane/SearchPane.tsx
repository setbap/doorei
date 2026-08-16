import { useEffect, useRef, useState } from "react"
import type { AppLanguage, LibrarySnapshot, SearchScope } from "../../../library/types.js"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { textDirection } from "../../../library/textDirection.js"
import { t } from "../uiText"

const SEARCH_PREVIEW = 5
const SEARCH_DEBOUNCE_MS = 300

export function SearchPane({
  snapshot,
  lang,
  query,
  setQuery,
  scope,
  setScope,
  scopeItems,
  onSeekHit
}: {
  snapshot: LibrarySnapshot
  lang: AppLanguage
  query: string
  setQuery: (value: string) => void
  scope: SearchScope
  setScope: (value: SearchScope) => void
  scopeItems: Record<SearchScope, string>
  onSeekHit: (videoId: string, startSeconds: number | null) => Promise<void>
}) {
  const [showAll, setShowAll] = useState(false)
  const debounceRef = useRef(0)
  const hits = snapshot.searchHits
  const visible = showAll ? hits : hits.slice(0, SEARCH_PREVIEW)

  useEffect(() => {
    setShowAll(false)
  }, [query, scope])

  useEffect(() => {
    const delay = query.trim() ? SEARCH_DEBOUNCE_MS : 0
    window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      void window.doorei.call("search", { text: query, scope })
    }, delay)
    return () => window.clearTimeout(debounceRef.current)
  }, [query, scope])

  function searchNow(): void {
    window.clearTimeout(debounceRef.current)
    void window.doorei.call("search", { text: query, scope })
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Input
          className="h-8 flex-1 text-sm"
          placeholder={t(lang, "searchPlaceholder")}
          value={query}
          dir={query.trim() ? textDirection(query) : "auto"}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") searchNow()
          }}
        />
        <Select
          value={scope}
          items={scopeItems}
          onValueChange={(value) => {
            if (value === "video" || value === "session" || value === "course") setScope(value)
          }}
        >
          <SelectTrigger className="h-8 w-28 shrink-0">
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
          {visible.map((hit, index) => (
            <li key={`${hit.videoId}-${hit.kind}-${hit.startSeconds}-${index}`}>
              <Button
                variant="secondary"
                className="h-auto w-full flex-col items-start gap-1 whitespace-normal py-2"
                onClick={() => void onSeekHit(hit.videoId, hit.startSeconds)}
              >
                <span className="text-xs text-muted-foreground">
                  {hit.kind === "note" ? t(lang, "note") : t(lang, "captions")}
                </span>
                <span className="w-full text-start" dir={textDirection(hit.text)}>
                  {hit.text}
                </span>
              </Button>
            </li>
          ))}
        </ul>
        {!showAll && hits.length > SEARCH_PREVIEW ? (
          <Button variant="link" className="mt-2 h-auto px-0" onClick={() => setShowAll(true)}>
            {t(lang, "showAllHits").replace("{count}", String(hits.length))}
          </Button>
        ) : null}
      </ScrollArea>
    </>
  )
}
