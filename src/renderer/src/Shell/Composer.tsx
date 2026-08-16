import type { Dispatch, FormEvent, RefObject, SetStateAction } from "react"
import type { AppLanguage, VideoRecord } from "../../../library/types.js"
import { textDirection } from "../../../library/textDirection.js"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { isModEnter, sendChord } from "../modEnter"
import { t } from "../uiText"

export function Composer({
  lang,
  note,
  setNote,
  stampOn,
  setStampOn,
  selected,
  videoRef
}: {
  lang: AppLanguage
  note: string
  setNote: Dispatch<SetStateAction<string>>
  stampOn: boolean
  setStampOn: Dispatch<SetStateAction<boolean>>
  selected: VideoRecord | undefined
  videoRef: RefObject<HTMLVideoElement | null>
}) {
  function onSubmit(event: FormEvent): void {
    event.preventDefault()
    if (!note.trim() || !selected) return
    const timestampSeconds = stampOn
      ? (videoRef.current?.currentTime ?? selected.playbackPositionSeconds)
      : null
    void window.doorei.call("addNote", {
      text: note.trim(),
      timestampSeconds
    })
    setNote("")
  }

  return (
    <form
      className="grid h-44 shrink-0 grid-rows-[minmax(0,1fr)_auto] border-t"
      onSubmit={onSubmit}
    >
      <div className="min-h-0 px-3 pt-2">
        <Textarea
          className="block h-full min-h-0 resize-none border-0 bg-transparent p-0 text-sm leading-6 shadow-none field-sizing-fixed focus-visible:ring-0 dark:bg-transparent placeholder:leading-6"
          placeholder={t(lang, "composerPlaceholder")}
          value={note}
          dir={note.trim() ? textDirection(note) : undefined}
          onChange={(event) => setNote(event.target.value)}
          onKeyDown={(event) => {
            if (!isModEnter(event)) return
            event.preventDefault()
            event.currentTarget.form?.requestSubmit()
          }}
        />
      </div>
      <div className="flex items-center justify-between border-t px-3 py-2">
        <Label className="font-normal text-muted-foreground">
          <Checkbox
            checked={stampOn}
            onCheckedChange={(checked) => setStampOn(checked === true)}
          />
          {t(lang, "timestamp")}
        </Label>
        <Button type="submit" disabled={!note.trim() || !selected}>
          {t(lang, "save")}
          <span className="text-[11px] font-normal text-primary-foreground/70">{sendChord()}</span>
        </Button>
      </div>
    </form>
  )
}
