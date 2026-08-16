import { Pause, Play } from "lucide-react";
import type { AppLanguage } from "../../../library/types.js";
import { cn } from "@/lib/utils";
import { t } from "../uiText";

export function PlayOverlay({
  lang,
  playing,
  visible,
  onTogglePlay,
  onSeekBack,
  onSeekForward,
}: {
  lang: AppLanguage;
  playing: boolean;
  visible: boolean;
  onTogglePlay: () => void;
  onSeekBack: () => void;
  onSeekForward: () => void;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-8 transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0"
      )}
      aria-hidden={!visible}
      dir="ltr"
    >
      <SkipCircle
        label={t(lang, "seekBack")}
        enabled={visible}
        onClick={onSeekBack}
      >
        <div className="text-sm me-1 h-full rounded-full w-full flex items-center justify-center font-medium tabular-nums text-white">
          −5
        </div>
      </SkipCircle>
      <button
        type="button"
        className={cn(
          "grid size-16 place-items-center rounded-full bg-white/12 text-white ring-1 ring-white/20 backdrop-blur-md",
          visible ? "pointer-events-auto" : "pointer-events-none"
        )}
        tabIndex={visible ? 0 : -1}
        aria-label={t(lang, playing ? "pause" : "play")}
        onClick={(event) => {
          event.stopPropagation();
          onTogglePlay();
        }}
      >
        {playing ? (
          <Pause className="size-7" />
        ) : (
          <Play className="ms-0.5 size-7" />
        )}
      </button>
      <SkipCircle
        label={t(lang, "seekForward")}
        enabled={visible}
        onClick={onSeekForward}
      >
        <div className="text-sm me-1 h-full rounded-full w-full flex items-center justify-center font-medium tabular-nums text-white">
          +5
        </div>
      </SkipCircle>
    </div>
  );
}

function SkipCircle({
  label,
  enabled,
  onClick,
  children,
}: {
  label: string;
  enabled: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "grid size-12 place-items-center rounded-full bg-white/12 text-sm font-medium tabular-nums text-white ring-1 ring-white/20 backdrop-blur-md",
        enabled ? "pointer-events-auto" : "pointer-events-none"
      )}
      tabIndex={enabled ? 0 : -1}
      aria-label={label}
      title={label}
      dir="ltr"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}
