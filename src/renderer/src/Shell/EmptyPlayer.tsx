import type { Dispatch, SetStateAction } from "react"
import type { AppLanguage, VideoRecord } from "../../../library/types.js"
import { Button } from "@/components/ui/button"
import { t } from "../uiText"
import type { PromptState } from "./prompt"

export function EmptyPlayer({
  lang,
  selected,
  setPrompt
}: {
  lang: AppLanguage
  selected: VideoRecord | undefined
  setPrompt: Dispatch<SetStateAction<PromptState>>
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
      <span>{selected?.fileMissing ? t(lang, "fileMissing") : t(lang, "noVideo")}</span>
      {selected?.fileMissing ? (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const path = await window.doorei.pickFile()
              if (path && selected) void window.doorei.call("relinkVideo", selected.id, path)
            }}
          >
            {t(lang, "relink")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const toDir = await window.doorei.pickDirectory()
              if (toDir) setPrompt({ kind: "from-folder", toDir })
            }}
          >
            {t(lang, "relinkFolder")}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
