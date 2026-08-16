import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react"
import type { AppLanguage, CaptionSegment } from "../../../library/types.js"
import { t } from "../uiText"
import { CaptionOverlay } from "./CaptionOverlay"
import { Controls } from "./Controls"
import { activeCaption } from "./format"
import { PlayOverlay } from "./PlayOverlay"

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
        <CaptionOverlay
          text={captionText}
          color={captionColor}
          background={captionBackground}
          raised={showChrome}
        />
      ) : null}

      {!playError ? (
        <PlayOverlay label={t(lang, "play")} playing={playing} onPlay={() => void togglePlay()} />
      ) : null}

      <Controls
        lang={lang}
        visible={showChrome}
        duration={duration}
        currentTime={currentTime}
        progress={progress}
        playing={playing}
        watched={watched}
        muted={muted}
        volumeValue={volumeValue}
        playbackSpeed={playbackSpeed}
        speedOpen={speedOpen}
        styleOpen={styleOpen}
        subtitlesVisible={subtitlesVisible}
        captionColor={captionColor}
        captionBackground={captionBackground}
        fullscreen={fullscreen}
        videoRef={videoRef}
        onSeek={seekTo}
        onPrevious={() => void skipOrReplay(onPrevious)}
        onTogglePlay={() => void togglePlay()}
        onNext={() => void skipOrReplay(onNext)}
        onMarkWatched={() => void markWatched()}
        onMutedChange={setMuted}
        onVolumeChange={(next, nextMuted) => {
          setVolume(next)
          setMuted(nextMuted)
        }}
        onSpeedOpenChange={setSpeedOpen}
        onStyleOpenChange={setStyleOpen}
        onPlaybackSpeedChange={onPlaybackSpeedChange}
        onSubtitlesVisibleChange={onSubtitlesVisibleChange}
        onCaptionStyleChange={onCaptionStyleChange}
        onToggleFullscreen={() => void toggleFullscreen()}
      />
    </div>
  )
}
