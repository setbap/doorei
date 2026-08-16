import { textDirection } from "../../../library/textDirection.js"
import { cn } from "@/lib/utils"

export function CaptionOverlay({
  text,
  color,
  background,
  raised
}: {
  text: string
  color: string
  background: string
  raised: boolean
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 z-10 flex justify-center px-6 transition-[bottom] duration-200",
        raised ? "bottom-24" : "bottom-8"
      )}
    >
      <span
        className="inline-block max-w-[90%] rounded-md px-2.5 py-1 text-center text-[0.95rem] leading-relaxed"
        dir={textDirection(text)}
        style={{
          color,
          backgroundColor: background === "transparent" ? undefined : background,
          textShadow: background === "transparent" ? "0 1px 3px rgb(0 0 0 / 85%)" : undefined
        }}
      >
        {text}
      </span>
    </div>
  )
}
