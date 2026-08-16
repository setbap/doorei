import type { Dispatch, SetStateAction } from "react"
import { Plus, Settings } from "lucide-react"
import type { AppLanguage, LibrarySnapshot, SessionRecord } from "../../../library/types.js"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { LibraryTree } from "../LibraryTree"
import { t } from "../uiText"
import type { PromptState } from "./prompt"

export function LibraryAside({
  snapshot,
  lang,
  setPrompt,
  setSessionDate,
  setSettingsOpen,
  onAddVideos
}: {
  snapshot: LibrarySnapshot
  lang: AppLanguage
  setPrompt: Dispatch<SetStateAction<PromptState>>
  setSessionDate: Dispatch<SetStateAction<string>>
  setSettingsOpen: Dispatch<SetStateAction<boolean>>
  onAddVideos: (picker: () => Promise<string[]>, sessionId?: string) => Promise<void>
}) {
  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-e text-sidebar-foreground">
      {snapshot.selectedCourseId ? (
        <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-1">
          <span className="truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t(lang, "sessions")}
          </span>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => {
                    setSessionDate("")
                    setPrompt({ kind: "session" })
                  }}
                />
              }
            >
              <Plus />
            </TooltipTrigger>
            <TooltipContent>{t(lang, "newSession")}</TooltipContent>
          </Tooltip>
        </div>
      ) : (
        <p className="px-3 pt-3 pb-1 text-xs text-muted-foreground">{t(lang, "emptyLibrary")}</p>
      )}
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-2 pb-2">
          <LibraryTree
            snapshot={snapshot}
            lang={lang}
            onAddVideos={(sessionId, picker) => void onAddVideos(picker, sessionId)}
            onRenameSession={(session: SessionRecord) =>
              setPrompt({
                kind: "rename-session",
                id: session.id,
                name: session.name
              })
            }
            onDeleteSession={(session) => {
              const empty = !snapshot.videos.some((video) => video.sessionId === session.id)
              if (empty) {
                void window.doorei.call("deleteSession", session.id)
                return
              }
              setPrompt({ kind: "delete-session", id: session.id })
            }}
          />
        </div>
      </ScrollArea>
      <Separator />
      <Button
        variant="ghost"
        className="mx-2 mb-2 h-9 shrink-0 justify-start rounded-lg px-3 focus-visible:border-transparent focus-visible:bg-muted focus-visible:ring-0"
        onClick={() => setSettingsOpen(true)}
      >
        <Settings />
        {t(lang, "settings")}
      </Button>
    </aside>
  )
}
