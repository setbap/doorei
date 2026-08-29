import { useEffect, useRef, useState, type RefObject } from "react";
import {
  playerShortcutBlocked,
  playerShortcutFromInput,
  steppedSpeed,
  steppedVolume,
  type PlayerKeyTarget,
} from "../../../library/playerKeys.js";
import { resumeSeconds } from "../../../library/playerPlayback.js";
import type { AppLanguage, CaptionSegment } from "../../../library/types.js";
import { textDirection } from "../../../library/textDirection.js";
import { cn } from "@/lib/utils";
import { t } from "../uiText";
import { CaptionOverlay } from "./CaptionOverlay";
import { Controls } from "./Controls";
import { SPEEDS } from "./constants";
import { activeCaption } from "./format";
import { PlayOverlay } from "./PlayOverlay";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  src: string;
  lang: AppLanguage;
  startSeconds: number;
  playbackSpeed: number;
  subtitlesVisible: boolean;
  captionColor: string;
  captionBackground: string;
  segments: CaptionSegment[];
  watched: boolean;
  playAfterSelect: boolean;
  title: string;
  onTimeUpdate: (seconds: number) => void;
  onEnded: () => void;
  onPrevious: () => Promise<boolean>;
  onNext: () => Promise<boolean>;
  onMarkWatched: () => Promise<void>;
  onPlaybackSpeedChange: (speed: number) => void;
  onSubtitlesVisibleChange: (visible: boolean) => void;
  onCaptionStyleChange: (style: {
    captionColor?: string;
    captionBackground?: string;
  }) => void;
};

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
  title,
  onTimeUpdate,
  onEnded,
  onPrevious,
  onNext,
  onMarkWatched,
  onPlaybackSpeedChange,
  onSubtitlesVisibleChange,
  onCaptionStyleChange,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | null>(null);
  const clickTimer = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(startSeconds);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsOn, setControlsOn] = useState(true);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const appliedStart = useRef(false);
  const captionText = activeCaption(segments, currentTime);

  useEffect(() => {
    setPlayError(null);
    setPlaying(false);
    appliedStart.current = false;
  }, [src]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.playbackRate = playbackSpeed;
  }, [playbackSpeed, videoRef]);

  useEffect(() => {
    function onChange(): void {
      setFullscreen(document.fullscreenElement === rootRef.current);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    bumpControls(playing);
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [playing, speedOpen, styleOpen]);

  function bumpControls(isPlaying = playing): void {
    setControlsOn(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    if (isPlaying && !speedOpen && !styleOpen) {
      hideTimer.current = window.setTimeout(() => setControlsOn(false), 2400);
    }
  }

  async function togglePlay(): Promise<void> {
    const el = videoRef.current;
    if (!el) return;
    setSpeedOpen(false);
    setStyleOpen(false);
    try {
      if (el.paused) await el.play();
      else el.pause();
      setPlayError(null);
    } catch (error) {
      setPlayError(
        error instanceof Error ? error.message : t(lang, "playError")
      );
    }
  }

  function seekTo(seconds: number): void {
    const el = videoRef.current;
    if (!el) return;
    const next = Math.min(Math.max(seconds, 0), duration || el.duration || 0);
    el.currentTime = next;
    setCurrentTime(next);
  }

  function onVideoClick(): void {
    if (clickTimer.current) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
      void toggleFullscreen();
      return;
    }
    void togglePlay();
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
    }, 220);
  }

  async function toggleFullscreen(): Promise<void> {
    const root = rootRef.current;
    if (!root) return;
    if (document.fullscreenElement === root) await document.exitFullscreen();
    else await root.requestFullscreen();
  }

  function replay(): void {
    seekTo(0);
    void videoRef.current?.play().catch(() => undefined);
  }

  async function skipOrReplay(request: () => Promise<boolean>): Promise<void> {
    const moved = await request();
    if (!moved) replay();
  }

  async function markWatched(): Promise<void> {
    await onMarkWatched();
    await skipOrReplay(onNext);
  }

  const onWindowKey = useRef<(event: KeyboardEvent) => void>(() => undefined);
  onWindowKey.current = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.isComposing) return;
    if (hasBlockingPlayerKeyTarget(event.target, rootRef.current)) return;
    const action = playerShortcutFromInput({
      key: event.key,
      code: event.code,
      meta: event.metaKey,
      control: event.ctrlKey,
      alt: event.altKey,
      shift: event.shiftKey,
      repeat: event.repeat,
    });
    if (!action) return;
    event.preventDefault();
    bumpControls();
    const el = videoRef.current;
    const time = el?.currentTime ?? currentTime;
    if (action === "playPause") void togglePlay();
    else if (action === "speedUp")
      onPlaybackSpeedChange(steppedSpeed(playbackSpeed, 1, SPEEDS));
    else if (action === "speedDown")
      onPlaybackSpeedChange(steppedSpeed(playbackSpeed, -1, SPEEDS));
    else if (action === "seekForward") seekTo(time + 5);
    else if (action === "seekBack") seekTo(time - 5);
    else if (action === "toggleCaptions")
      onSubtitlesVisibleChange(!subtitlesVisible);
    else if (action === "toggleFullscreen") void toggleFullscreen();
    else if (action === "toggleMute") {
      if (!el) return;
      el.muted = !el.muted;
      setMuted(el.muted);
    } else if (action === "volumeUp" || action === "volumeDown") {
      if (!el) return;
      if (el.muted && action === "volumeUp") {
        el.muted = false;
        if (el.volume === 0) el.volume = steppedVolume(0, 1);
        setMuted(false);
        setVolume(el.volume);
      } else {
        const next = steppedVolume(
          el.muted ? 0 : el.volume,
          action === "volumeUp" ? 1 : -1
        );
        el.muted = next === 0;
        if (next > 0) el.volume = next;
        setVolume(next);
        setMuted(next === 0);
      }
    } else if (action === "nextVideo") void skipOrReplay(onNext);
    else if (action === "previousVideo") void skipOrReplay(onPrevious);
  };

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      onWindowKey.current(event);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const volumeValue = muted ? 0 : volume;
  const showChrome = controlsOn || !playing || speedOpen || styleOpen;

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      className="absolute inset-0 bg-black outline-none"
      onMouseMove={() => bumpControls()}
      onMouseLeave={() => {
        if (playing && !speedOpen && !styleOpen) setControlsOn(false);
      }}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full bg-black object-contain"
        src={src}
        playsInline
        autoPlay={playAfterSelect}
        preload="metadata"
        onClick={onVideoClick}
        onError={() => setPlayError(t(lang, "playError"))}
        onLoadedMetadata={(event) => {
          const el = event.currentTarget;
          setPlayError(null);
          setDuration(el.duration || 0);
          const start = resumeSeconds(startSeconds, el.duration || 0);
          if (!appliedStart.current && start > 0) {
            el.currentTime = start;
          }
          appliedStart.current = true;
          el.playbackRate = playbackSpeed;
          el.volume = volume;
          setCurrentTime(el.currentTime);
          if (playAfterSelect) void el.play().catch(() => undefined);
        }}
        onPlay={() => setPlaying(true)}
        onPause={(event) => {
          setPlaying(false);
          onTimeUpdate(event.currentTarget.currentTime);
        }}
        onVolumeChange={(event) => {
          setVolume(event.currentTarget.volume);
          setMuted(event.currentTarget.muted);
        }}
        onTimeUpdate={(event) => {
          const time = event.currentTarget.currentTime;
          setCurrentTime(time);
          onTimeUpdate(time);
        }}
        onSeeked={(event) => {
          const time = event.currentTarget.currentTime;
          setCurrentTime(time);
          onTimeUpdate(time);
        }}
        onEnded={onEnded}
      />

      {playError ? (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black px-6 text-center text-sm text-white/80">
          {playError}
        </div>
      ) : null}

      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/50 via-black/18 to-transparent px-4 pt-3 pb-24 transition-opacity duration-200",
          showChrome ? "opacity-100" : "opacity-0"
        )}
      >
        <p
          className="truncate text-center text-sm font-medium text-white/90"
          dir={textDirection(title)}
          title={title}
        >
          {title}
        </p>
      </div>

      {subtitlesVisible && captionText ? (
        <CaptionOverlay
          text={captionText}
          color={captionColor}
          background={captionBackground}
          raised={showChrome}
        />
      ) : null}

      {!playError ? (
        <PlayOverlay
          lang={lang}
          playing={playing}
          visible={showChrome || !playing}
          onTogglePlay={() => void togglePlay()}
          onSeekBack={() =>
            seekTo((videoRef.current?.currentTime ?? currentTime) - 5)
          }
          onSeekForward={() =>
            seekTo((videoRef.current?.currentTime ?? currentTime) + 5)
          }
        />
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
          setVolume(next);
          setMuted(nextMuted);
        }}
        onSpeedOpenChange={setSpeedOpen}
        onStyleOpenChange={setStyleOpen}
        onPlaybackSpeedChange={onPlaybackSpeedChange}
        onSubtitlesVisibleChange={onSubtitlesVisibleChange}
        onCaptionStyleChange={onCaptionStyleChange}
        onToggleFullscreen={() => void toggleFullscreen()}
      />
    </div>
  );
}

function hasBlockingPlayerKeyTarget(
  target: EventTarget | null,
  playerRoot: HTMLElement | null
): boolean {
  if (!(target instanceof Element)) return false;
  const insidePlayer = Boolean(playerRoot?.contains(target));
  let el: Element | null = target;
  while (el && el !== playerRoot) {
    const snapshot: PlayerKeyTarget = {
      tagName: el.tagName,
      type: el instanceof HTMLInputElement ? el.type : undefined,
      isContentEditable: el instanceof HTMLElement && el.isContentEditable,
      role: el.getAttribute("role"),
    };
    if (playerShortcutBlocked(snapshot, insidePlayer ? "player" : "app"))
      return true;
    el = el.parentElement;
  }
  return false;
}
