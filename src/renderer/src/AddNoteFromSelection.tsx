import { useEffect, useRef, useState, type RefObject } from "react"
import { StickyNote } from "lucide-react"
import type { AppLanguage } from "../../library/types.js"
import { Button } from "@/components/ui/button"
import { t } from "./uiText"

type Bar = { text: string; top: number; left: number; below: boolean }

export function AddNoteFromSelection({
  lang,
  rootRef
}: {
  lang: AppLanguage
  rootRef: RefObject<HTMLElement | null>
}) {
  const [bar, setBar] = useState<Bar | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function read(): Bar | null {
      const root = rootRef.current
      const selection = window.getSelection()
      if (!root || !selection || selection.isCollapsed || selection.rangeCount === 0) return null
      const range = selection.getRangeAt(0)
      if (!root.contains(range.commonAncestorContainer)) return null
      const text = selection.toString().replace(/\s+/g, " ").trim()
      if (!text) return null
      const rect = range.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return null
      const below = rect.top < 44
      return {
        text,
        top: below ? rect.bottom + 8 : rect.top - 8,
        left: Math.min(window.innerWidth - 16, Math.max(16, rect.left + rect.width / 2)),
        below
      }
    }

    function update(): void {
      setBar(read())
    }

    function onPointerUp(event: PointerEvent): void {
      if (barRef.current?.contains(event.target as Node)) return
      window.setTimeout(update, 0)
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        window.getSelection()?.removeAllRanges()
        setBar(null)
      }
    }

    document.addEventListener("pointerup", onPointerUp)
    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("scroll", update, true)
    window.addEventListener("resize", update)
    return () => {
      document.removeEventListener("pointerup", onPointerUp)
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("scroll", update, true)
      window.removeEventListener("resize", update)
    }
  }, [rootRef])

  if (!bar) return null

  return (
    <div
      ref={barRef}
      className="pointer-events-auto fixed z-50"
      style={{
        top: bar.top,
        left: bar.left,
        transform: bar.below ? "translate(-50%, 0)" : "translate(-50%, -100%)"
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <Button
        size="xs"
        className="rounded-full border border-white/15 bg-neutral-950/90 text-neutral-100 shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur-xl hover:bg-neutral-900"
        onClick={() => {
          void window.doorei.call("addNote", { text: bar.text, timestampSeconds: null })
          window.getSelection()?.removeAllRanges()
          setBar(null)
        }}
      >
        <StickyNote />
        {t(lang, "addAsNote")}
      </Button>
    </div>
  )
}
