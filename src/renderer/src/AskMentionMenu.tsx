import { useEffect, useRef } from "react"
import { FileVideo, Folder } from "lucide-react"
import type { AppLanguage } from "../../library/types.js"
import { highlightRanges, type MentionableItem } from "../../library/askMentions.js"
import { t } from "./uiText"
import { cn } from "@/lib/utils"

type Props = {
  items: MentionableItem[]
  query: string
  selectedIndex: number
  lang: AppLanguage
  onHover: (index: number) => void
  onSelect: (item: MentionableItem) => void
}

export function AskMentionMenu({ items, query, selectedIndex, lang, onHover, onSelect }: Props) {
  const selectedRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  if (items.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-sm text-muted-foreground">
        {t(lang, "askMentionEmpty")}
      </p>
    )
  }

  return (
    <div role="listbox" aria-label={t(lang, "askMention")} className="max-h-72 overflow-y-auto p-1">
      {items.map((item, index) => {
        const selected = index === selectedIndex
        const Icon = item.kind === "session" ? Folder : FileVideo
        return (
          <button
            key={`${item.kind}:${item.id}`}
            ref={selected ? selectedRef : undefined}
            type="button"
            role="option"
            aria-selected={selected}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm",
              selected ? "bg-white/8" : "hover:bg-white/5"
            )}
            onMouseEnter={() => onHover(index)}
            onMouseDown={(event) => {
              event.preventDefault()
              onSelect(item)
            }}
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate font-medium">
              <Highlight text={item.name} query={query} />
            </span>
            {item.path ? (
              <span className="ms-auto min-w-0 max-w-[45%] truncate text-xs text-muted-foreground">
                <Highlight text={item.path} query={query} />
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

function Highlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightRanges(text, query).map((part, index) =>
        part.match ? (
          <span key={index} className="text-sky-400">
            {part.text}
          </span>
        ) : (
          <span key={index}>{part.text}</span>
        )
      )}
    </>
  )
}
