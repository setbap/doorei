import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from "react"
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
import type { AppLanguage, CaptionSegment } from "../../library/types.js"
import { textDirection } from "../../library/textDirection.js"
import { cn } from "@/lib/utils"
import { t } from "./uiText"

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
const TEXT_COLORS = ["#ffffff", "#facc15", "#67e8f9", "#111111"]
const BG_COLORS = ["transparent", "#00000080", "#000000e6", "#ffffffcc"]

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>
  src: string
  lang: AppLanguage
  startSeconds: number
  playbackSpeed: number
  subtitlesVisible: boolean
  captionColor: string
  captionBackground: string
  segments: CaptionSegment[]
  watched: boolean
  playAfterSelect: boolean
  onTimeUpdate: (seconds: number) => void
  onEnded: () => void
  onPrevious: () => Promise<boolean>
  onNext: () => Promise<boolean>
  onMarkWatched: () => Promise<void>
  onPlaybackSpeedChange: (speed: number) => void
  onSubtitlesVisibleChange: (visible: boolean) => void
  onCaptionStyleChange: (style: { captionColor?: string; captionBackground?: string }) => void
}

export function Player({
  videoRef,
  src,
  lang,
  startSeconds,
  playbackSpeed,
  subtitlesVisible,
  captionColor,
  captionBackground,
  segments,
  watched,
  playAfterSelect,
  onTimeUpdate,
  onEnded,
  onPrevious,
  onNext,
  onMarkWatched,
  onPlaybackSpeedChange,
  onSubtitlesVisibleChange,
  onCaptionStyleChange
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<number | null>(null)
  const clickTimer = useRef<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(startSeconds)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [controlsOn, setControlsOn] = useState(true)
  const [speedOpen, setSpeedOpen] = useState(false)
  const [styleOpen, setStyleOpen] = useState(false)
  const [playError, setPlayError] = useState<string | null>(null)
  const appliedStart = useRef(false)
  const captionText = activeCaption(segments, currentTime)

  useEffect(() => {
    setPlayError(null)
    setPlaying(false)
    appliedStart.current = false
  }, [src])

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.playbackRate = playbackSpeed
  }, [playbackSpeed, videoRef])

  useEffect(() => {
    function onChange(): void {
      setFullscreen(document.fullscreenElement === rootRef.current)
    }
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  useEffect(() => {
    bumpControls(playing)
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current)
    }
  }, [playing, speedOpen, styleOpen])

  function bumpControls(isPlaying = playing): void {
    setControlsOn(true)
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    if (isPlaying && !speedOpen && !styleOpen) {
      hideTimer.current = window.setTimeout(() => setControlsOn(false), 2400)
    }
  }

  async function togglePlay(): Promise<void> {
    const el = videoRef.current
    if (!el) return
    setSpeedOpen(false)
    setStyleOpen(false)
    try {
      if (el.paused) await el.play()
      else el.pause()
      setPlayError(null)
    } catch (error) {
      setPlayError(error instanceof Error ? error.message : t(lang, "playError"))
    }
  }

  function seekTo(seconds: number): void {
    const el = videoRef.current
    if (!el) return
    const next = Math.min(Math.max(seconds, 0), duration || el.duration || 0)
    el.currentTime = next
    setCurrentTime(next)
  }

  function onVideoClick(): void {
    if (clickTimer.current) {
      window.clearTimeout(clickTimer.current)
      clickTimer.current = null
      void toggleFullscreen()
      return
    }
    void togglePlay()
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null
    }, 220)
  }

  async function toggleFullscreen(): Promise<void> {
    const root = rootRef.current
    if (!root) return
    if (document.fullscreenElement === root) await document.exitFullscreen()
    else await root.requestFullscreen()
  }

  function replay(): void {
    seekTo(0)
    void videoRef.current?.play().catch(() => undefined)
  }

  async function skipOrReplay(request: () => Promise<boolean>): Promise<void> {
    const moved = await request()
    if (!moved) replay()
  }

  async function markWatched(): Promise<void> {
    await onMarkWatched()
    await skipOrReplay(onNext)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.target instanceof HTMLInputElement) return
    if (event.code === "Space" || event.key === "k") {
      event.preventDefault()
      void togglePlay()
    } else if (event.key === "ArrowRight") {
      event.preventDefault()
      seekTo(currentTime + 5)
    } else if (event.key === "ArrowLeft") {
      event.preventDefault()
      seekTo(currentTime - 5)
    } else if (event.key === "f") {
      event.preventDefault()
      void toggleFullscreen()
    } else if (event.key === "m") {
      event.preventDefault()
      const el = videoRef.current
      if (!el) return
      el.muted = !el.muted
      setMuted(el.muted)
    } else if (event.key === "c") {
      event.preventDefault()
      onSubtitlesVisibleChange(!subtitlesVisible)
    } else if (event.key === "N") {
      event.preventDefault()
      void skipOrReplay(onNext)
    } else if (event.key === "P") {
      event.preventDefault()
      void skipOrReplay(onPrevious)
    }
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const volumeValue = muted ? 0 : volume
  const showChrome = controlsOn || !playing || speedOpen || styleOpen

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      className="absolute inset-0 bg-black outline-none"
      onMouseMove={() => bumpControls()}
      onMouseLeave={() => {
        if (playing && !speedOpen && !styleOpen) setControlsOn(false)
      }}
      onKeyDown={onKeyDown}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full bg-black object-contain"
        src={src}
        playsInline
        preload="auto"
        onClick={onVideoClick}
        onError={() => setPlayError(t(lang, "playError"))}
        onLoadedMetadata={(event) => {
          const el = event.currentTarget
          setPlayError(null)
          setDuration(el.duration || 0)
          if (!appliedStart.current && startSeconds > 0) {
            el.currentTime = startSeconds
            appliedStart.current = true
          }
          el.playbackRate = playbackSpeed
          el.volume = volume
          setCurrentTime(el.currentTime)
          if (playAfterSelect) void el.play().catch(() => undefined)
        }}
        onPlay={() => setPlaying(true)}
        onPause={(event) => {
          setPlaying(false)
          onTimeUpdate(event.currentTarget.currentTime)
        }}
        onVolumeChange={(event) => {
          setVolume(event.currentTarget.volume)
          setMuted(event.currentTarget.muted)
        }}
        onTimeUpdate={(event) => {
          const time = event.currentTarget.currentTime
          setCurrentTime(time)
          onTimeUpdate(time)
        }}
        onSeeked={(event) => {
          const time = event.currentTarget.currentTime
          setCurrentTime(time)
          onTimeUpdate(time)
        }}
        onEnded={onEnded}
      />

      {playError ? (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black px-6 text-center text-sm text-white/80">
          {playError}
        </div>
      ) : null}

      {subtitlesVisible && captionText ? (
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 z-10 flex justify-center px-6 transition-[bottom] duration-200",
            showChrome ? "bottom-24" : "bottom-8"
          )}
        >
          <span
            className="inline-block max-w-[90%] rounded-md px-2.5 py-1 text-center text-[0.95rem] leading-relaxed"
            dir={textDirection(captionText)}
            style={{
              color: captionColor,
              backgroundColor: captionBackground === "transparent" ? undefined : captionBackground,
              textShadow:
                captionBackground === "transparent" ? "0 1px 3px rgb(0 0 0 / 85%)" : undefined
            }}
          >
            {captionText}
          </span>
        </div>
      ) : null}

      {!playError && !playing ? (
        <button
          type="button"
          className="absolute inset-0 z-10 grid place-items-center"
          aria-label={t(lang, "play")}
          onClick={(event) => {
            event.stopPropagation()
            void togglePlay()
          }}
        >
          <span className="grid size-16 place-items-center rounded-full bg-white/12 text-white ring-1 ring-white/20 backdrop-blur-md">
            <Play className="ms-0.5 size-7" />
          </span>
        </button>
      ) : !playError ? (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-10 grid place-items-center transition-opacity duration-200",
            playing ? "opacity-0" : "opacity-100"
          )}
          aria-hidden
        >
          <span className="grid size-16 place-items-center rounded-full bg-white/12 text-white ring-1 ring-white/20 backdrop-blur-md">
            <Play className="ms-0.5 size-7" />
          </span>
        </div>
      ) : null}

      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-3 pt-10 pb-3 transition-opacity duration-200",
          showChrome ? "opacity-100" : "opacity-0"
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
          onChange={(event) => seekTo(Number(event.target.value))}
        />
        <div className="pointer-events-auto flex items-center gap-1.5 text-white">
          <IconButton label={t(lang, "previous")} onClick={() => void skipOrReplay(onPrevious)}>
            <ChevronLeft className="rtl:rotate-180" />
          </IconButton>
          <IconButton label={t(lang, playing ? "pause" : "play")} onClick={() => void togglePlay()}>
            {playing ? <Pause /> : <Play className="ms-px" />}
          </IconButton>
          <IconButton label={t(lang, "next")} onClick={() => void skipOrReplay(onNext)}>
            <ChevronRight className="rtl:rotate-180" />
          </IconButton>
          <IconButton label={t(lang, "watched")} onClick={() => void markWatched()}>
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
                setMuted(el.muted)
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
                setVolume(next)
                setMuted(next === 0)
              }}
            />
            <div className="relative">
              <button
                type="button"
                className="flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs leading-none font-medium text-white/90 hover:bg-white/15"
                aria-label={t(lang, "speed")}
                onClick={() => {
                  setSpeedOpen((open) => !open)
                  setStyleOpen(false)
                }}
              >
                {formatSpeed(playbackSpeed)}
              </button>
              {speedOpen ? (
                <div className="absolute end-0 bottom-10 z-30 min-w-24 rounded-lg bg-neutral-950/95 p-1 ring-1 ring-white/12 backdrop-blur-md">
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
                        setSpeedOpen(false)
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
                  setStyleOpen((open) => !open)
                  setSpeedOpen(false)
                }}
              >
                <Captions className={subtitlesVisible ? "text-white" : "text-white/45"} />
              </IconButton>
              {styleOpen ? (
                <div className="absolute end-0 bottom-10 z-30 w-56 rounded-lg bg-neutral-950/95 p-3 text-white ring-1 ring-white/12 backdrop-blur-md">
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
              onClick={() => void toggleFullscreen()}
            >
              {fullscreen ? <Minimize /> : <Maximize />}
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  )
}

function IconButton({
  label,
  onClick,
  children
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="grid size-8 place-items-center rounded-md text-white/90 transition hover:bg-white/15 hover:text-white [&_svg]:size-4"
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function Swatches({
  values,
  selected,
  onSelect
}: {
  values: string[]
  selected: string
  onSelect: (value: string) => void
}) {
  return (
    <div className="flex gap-1.5">
      {values.map((value) => (
        <button
          key={value}
          type="button"
          className={cn(
            "size-6 rounded-full ring-1 ring-white/25",
            selected.toLowerCase() === value.toLowerCase() && "ring-2 ring-white"
          )}
          style={swatchStyle(value)}
          onClick={() => onSelect(value)}
        />
      ))}
    </div>
  )
}

function swatchStyle(value: string): CSSProperties {
  if (value === "transparent") {
    return {
      backgroundImage:
        "linear-gradient(45deg, #555 25%, transparent 25%), linear-gradient(-45deg, #555 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #555 75%), linear-gradient(-45deg, transparent 75%, #555 75%)",
      backgroundSize: "8px 8px",
      backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0"
    }
  }
  return { backgroundColor: value }
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`
}

function formatSpeed(speed: number): string {
  return `${speed}×`
}

function toHex6(color: string): string {
  const hex = color.startsWith("#") ? color.slice(0, 7) : "#ffffff"
  return hex.length === 7 ? hex : "#ffffff"
}

function activeCaption(segments: CaptionSegment[], time: number): string {
  return segments.find((segment) => time >= segment.startSeconds && time <= segment.endSeconds)?.text ?? ""
}
