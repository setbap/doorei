import type { CSSProperties, RefObject } from "react"
import {
  Captions,
  Check,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX
} from "lucide-react"
import type { AppLanguage } from "../../../library/types.js"
import { cn } from "@/lib/utils"
import { glassMenu } from "@/lib/glass"
import { t } from "../uiText"
import { BG_COLORS, SPEEDS, TEXT_COLORS } from "./constants"
import { formatSpeed, formatTime, toHex6 } from "./format"
import { IconButton } from "./IconButton"
import { Swatches } from "./Swatches"

export function Controls({
  lang,
  visible,
  duration,
  currentTime,
  progress,
  playing,
  watched,
  muted,
  volumeValue,
  playbackSpeed,
  speedOpen,
  styleOpen,
  subtitlesVisible,
  captionColor,
  captionBackground,
  fullscreen,
  videoRef,
  onSeek,
  onPrevious,
  onTogglePlay,
  onNext,
  onMarkWatched,
  onMutedChange,
  onVolumeChange,
  onSpeedOpenChange,
  onStyleOpenChange,
  onPlaybackSpeedChange,
  onSubtitlesVisibleChange,
  onCaptionStyleChange,
  onToggleFullscreen
}: {
  lang: AppLanguage
  visible: boolean
  duration: number
  currentTime: number
  progress: number
  playing: boolean
  watched: boolean
  muted: boolean
  volumeValue: number
  playbackSpeed: number
  speedOpen: boolean
  styleOpen: boolean
  subtitlesVisible: boolean
  captionColor: string
  captionBackground: string
  fullscreen: boolean
  videoRef: RefObject<HTMLVideoElement | null>
  onSeek: (seconds: number) => void
  onPrevious: () => void
  onTogglePlay: () => void
  onNext: () => void
  onMarkWatched: () => void
  onMutedChange: (muted: boolean) => void
  onVolumeChange: (volume: number, muted: boolean) => void
  onSpeedOpenChange: (open: boolean) => void
  onStyleOpenChange: (open: boolean) => void
  onPlaybackSpeedChange: (speed: number) => void
  onSubtitlesVisibleChange: (visible: boolean) => void
  onCaptionStyleChange: (style: { captionColor?: string; captionBackground?: string }) => void
  onToggleFullscreen: () => void
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-3 pt-10 pb-3 transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0"
      )}
    >
      <input
        type="range"
        className="player-range pointer-events-auto mb-2 block w-full"
        min={0}
        max={duration || 0}
        step={0.1}
        value={Number.isFinite(currentTime) ? currentTime : 0}
        aria-label={t(lang, "seek")}
        dir="ltr"
        style={{ "--player-progress": `${progress}%` } as CSSProperties}
        onChange={(event) => onSeek(Number(event.target.value))}
      />
      <div className="pointer-events-auto flex items-center gap-1.5 text-white">
        <IconButton label={t(lang, "previous")} onClick={onPrevious}>
          <ChevronLeft className="rtl:rotate-180" />
        </IconButton>
        <IconButton label={t(lang, playing ? "pause" : "play")} onClick={onTogglePlay}>
          {playing ? <Pause /> : <Play className="ms-px" />}
        </IconButton>
        <IconButton label={t(lang, "next")} onClick={onNext}>
          <ChevronRight className="rtl:rotate-180" />
        </IconButton>
        <IconButton label={t(lang, "watched")} onClick={onMarkWatched}>
          <Check className={watched ? "text-emerald-300" : undefined} />
        </IconButton>
        <span className="min-w-20 px-1 font-medium text-white/85 tabular-nums" dir="ltr">
          {formatTime(currentTime)}
          <span className="text-white/45"> / {formatTime(duration)}</span>
        </span>
        <div className="ms-auto flex items-center gap-1">
          <IconButton
            label={t(lang, muted || volumeValue === 0 ? "unmute" : "mute")}
            onClick={() => {
              const el = videoRef.current
              if (!el) return
              el.muted = !el.muted
              onMutedChange(el.muted)
            }}
          >
            {muted || volumeValue === 0 ? <VolumeX /> : <Volume2 />}
          </IconButton>
          <input
            type="range"
            className="player-range w-20"
            min={0}
            max={1}
            step={0.05}
            value={volumeValue}
            aria-label={t(lang, "volume")}
            dir="ltr"
            style={{ "--player-progress": `${volumeValue * 100}%` } as CSSProperties}
            onChange={(event) => {
              const el = videoRef.current
              const next = Number(event.target.value)
              if (!el) return
              el.muted = next === 0
              el.volume = next
              onVolumeChange(next, next === 0)
            }}
          />
          <div className="relative">
            <button
              type="button"
              className="flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs leading-none font-medium text-white/90 hover:bg-white/15"
              aria-label={t(lang, "speed")}
              onClick={() => {
                onSpeedOpenChange(!speedOpen)
                onStyleOpenChange(false)
              }}
            >
              {formatSpeed(playbackSpeed)}
            </button>
            {speedOpen ? (
              <div className={cn("absolute end-0 bottom-10 z-30 min-w-24 rounded-xl p-1", glassMenu)}>
                {SPEEDS.map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    className={cn(
                      "flex w-full rounded-md px-2.5 py-1.5 text-start text-sm text-white/80 hover:bg-white/10",
                      speed === playbackSpeed && "bg-white/12 font-medium text-white"
                    )}
                    onClick={() => {
                      onPlaybackSpeedChange(speed)
                      onSpeedOpenChange(false)
                    }}
                  >
                    {formatSpeed(speed)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="relative">
            <IconButton
              label={t(lang, "captionStyle")}
              onClick={() => {
                onStyleOpenChange(!styleOpen)
                onSpeedOpenChange(false)
              }}
            >
              <Captions className={subtitlesVisible ? "text-white" : "text-white/45"} />
            </IconButton>
            {styleOpen ? (
              <div className={cn("absolute end-0 bottom-10 z-30 w-56 rounded-xl p-3 text-white", glassMenu)}>
                <label className="mb-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-white"
                    checked={subtitlesVisible}
                    onChange={(event) => onSubtitlesVisibleChange(event.target.checked)}
                  />
                  {t(lang, "showCaptions")}
                </label>
                <p className="mb-1.5 text-xs text-white/55">{t(lang, "captionColor")}</p>
                <div className="flex items-center gap-1.5">
                  <Swatches
                    values={TEXT_COLORS}
                    selected={captionColor}
                    onSelect={(value) => onCaptionStyleChange({ captionColor: value })}
                  />
                  <input
                    type="color"
                    className="size-6 cursor-pointer rounded border-0 bg-transparent"
                    value={toHex6(captionColor)}
                    onChange={(event) => onCaptionStyleChange({ captionColor: event.target.value })}
                  />
                </div>
                <p className="mt-3 mb-1.5 text-xs text-white/55">{t(lang, "captionBackground")}</p>
                <div className="flex items-center gap-1.5">
                  <Swatches
                    values={BG_COLORS}
                    selected={captionBackground}
                    onSelect={(value) => onCaptionStyleChange({ captionBackground: value })}
                  />
                  <input
                    type="color"
                    className="size-6 cursor-pointer rounded border-0 bg-transparent"
                    value={toHex6(captionBackground === "transparent" ? "#000000" : captionBackground)}
                    onChange={(event) =>
                      onCaptionStyleChange({ captionBackground: `${event.target.value}cc` })
                    }
                  />
                </div>
              </div>
            ) : null}
          </div>
          <IconButton
            label={t(lang, fullscreen ? "exitFullscreen" : "fullscreen")}
            onClick={onToggleFullscreen}
          >
            {fullscreen ? <Minimize /> : <Maximize />}
          </IconButton>
        </div>
      </div>
    </div>
  )
}
