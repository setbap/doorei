import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react"
import type { AppLanguage, Caption, LibrarySnapshot, VideoRecord } from "../../../library/types.js"
import { publishPlaybackTime } from "../playbackClock"
import { Player } from "../Player"
import { Composer } from "./Composer"
import { EmptyPlayer } from "./EmptyPlayer"
import type { PromptState } from "./prompt"
import { fireConfetti } from "./status"

export function PlayerStage({
  snapshot,
  lang,
  selected,
  mediaUrl,
  caption,
  videoRef,
  playAfterSelect,
  composerOpen,
  note,
  setNote,
  stampOn,
  setStampOn,
  lastPosWrite,
  setPrompt,
  selectAndPlay
}: {
  snapshot: LibrarySnapshot
  lang: AppLanguage
  selected: VideoRecord | undefined
  mediaUrl: string | null
  caption: Caption | null
  videoRef: RefObject<HTMLVideoElement | null>
  playAfterSelect: boolean
  composerOpen: boolean
  note: string
  setNote: Dispatch<SetStateAction<string>>
  stampOn: boolean
  setStampOn: Dispatch<SetStateAction<boolean>>
  lastPosWrite: MutableRefObject<number>
  setPrompt: Dispatch<SetStateAction<PromptState>>
  selectAndPlay: (method: "nextVideoId" | "previousVideoId") => Promise<boolean>
}) {
  return (
    <main className="flex h-full min-h-0 flex-col">
      <div className="relative min-h-0 flex-1 bg-black">
        {selected && mediaUrl && !selected.fileMissing ? (
          <Player
            videoRef={videoRef}
            src={mediaUrl}
            lang={lang}
            startSeconds={selected.playbackPositionSeconds}
            playbackSpeed={snapshot.settings.playbackSpeed}
            subtitlesVisible={snapshot.settings.subtitlesVisible}
            captionColor={snapshot.settings.captionColor}
            captionBackground={snapshot.settings.captionBackground}
            segments={caption?.segments ?? []}
            watched={selected.watched}
            playAfterSelect={playAfterSelect}
            title={selected.name}
            onTimeUpdate={(time) => {
              publishPlaybackTime(time)
              const now = Date.now()
              if (now - lastPosWrite.current < 800) return
              lastPosWrite.current = now
              void window.doorei.call("setPlaybackPosition", time)
            }}
            onEnded={() => {
              void (async () => {
                await window.doorei.call("markEnded")
                if (snapshot.settings.confetti) fireConfetti()
                await selectAndPlay("nextVideoId")
              })()
            }}
            onPlaybackSpeedChange={(speed) => {
              void window.doorei.call("updateSettings", {
                playbackSpeed: speed
              })
            }}
            onSubtitlesVisibleChange={(visible) => {
              void window.doorei.call("updateSettings", {
                subtitlesVisible: visible
              })
            }}
            onCaptionStyleChange={(style) => {
              void window.doorei.call("updateSettings", style)
            }}
            onPrevious={() => selectAndPlay("previousVideoId")}
            onNext={() => selectAndPlay("nextVideoId")}
            onMarkWatched={async () => {
              await window.doorei.call("setWatched", selected.id, true)
            }}
          />
        ) : (
          <EmptyPlayer lang={lang} selected={selected} setPrompt={setPrompt} />
        )}
      </div>
      {composerOpen ? (
        <Composer
          lang={lang}
          note={note}
          setNote={setNote}
          stampOn={stampOn}
          setStampOn={setStampOn}
          selected={selected}
          videoRef={videoRef}
        />
      ) : null}
    </main>
  )
}
