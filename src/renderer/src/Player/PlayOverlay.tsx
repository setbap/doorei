import { Play } from "lucide-react"
import { cn } from "@/lib/utils"

export function PlayOverlay({
  label,
  playing,
  onPlay
}: {
  label: string
  playing: boolean
  onPlay: () => void
}) {
  if (!playing) {
    return (
      <button
        type="button"
        className="absolute inset-0 z-10 grid place-items-center"
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation()
          onPlay()
        }}
      >
        <PlayBadge />
      </button>
    )
  }
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-10 grid place-items-center transition-opacity duration-200",
        "opacity-0"
      )}
      aria-hidden
    >
      <PlayBadge />
    </div>
  )
}

function PlayBadge() {
  return (
    <span className="grid size-16 place-items-center rounded-full bg-white/12 text-white ring-1 ring-white/20 backdrop-blur-md">
      <Play className="ms-0.5 size-7" />
    </span>
  )
}
