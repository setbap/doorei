import { Pause, Play } from "lucide-react";
import type { ReactNode } from "react";
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
        <div className="flex h-[90%] w-[90%] items-center justify-center text-xs font-medium tabular-nums text-white">
          −5
        </div>
      </SkipCircle>
      <button
        type="button"
        className={cn(
          "grid size-16 place-items-center rounded-full bg-black/25 text-white shadow-lg ring-1 ring-white/25 backdrop-blur-md",
          visible ? "pointer-events-auto" : "pointer-events-none"
        )}
        tabIndex={visible ? 0 : -1}
        aria-label={t(lang, playing ? "pause" : "play")}
        onClick={(event) => {
          event.stopPropagation();
          onTogglePlay();
        }}
      >
        <span className="grid size-[90%] place-items-center drop-shadow-sm">
          {playing ? <Pause className="size-6" /> : <Play className="ms-0.5 size-6" />}
        </span>
      </button>
      <SkipCircle
        label={t(lang, "seekForward")}
        enabled={visible}
        onClick={onSeekForward}
      >
        <div className="flex h-[90%] w-[90%] items-center justify-center text-xs font-medium tabular-nums text-white">
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
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        "grid size-12 place-items-center rounded-full bg-black/25 text-xs font-medium tabular-nums text-white shadow-lg ring-1 ring-white/25 backdrop-blur-md",
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
