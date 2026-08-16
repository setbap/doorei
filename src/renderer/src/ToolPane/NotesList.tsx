import type { AppLanguage, LibrarySnapshot } from "../../../library/types.js"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { textDirection } from "../../../library/textDirection.js"
import { t } from "../uiText"

export function NotesList({
  snapshot,
  lang,
  onSeek,
  onEditNote
}: {
  snapshot: LibrarySnapshot
  lang: AppLanguage
  onSeek: (seconds: number | null) => void
  onEditNote: (id: string, text: string) => void
}) {
  return (
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
              <p className="text-sm" data-selectable dir={textDirection(item.text)}>
                {item.text}
              </p>
              <Button variant="ghost" size="xs" onClick={() => onEditNote(item.id, item.text)}>
                {t(lang, "editNote")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </ScrollArea>
  )
}
