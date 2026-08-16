import { useEffect, useRef, useState } from "react"
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  X
} from "lucide-react"
import { usePanelRef } from "react-resizable-panels"
import { playAfterMediaReady } from "../../../library/playerPlayback.js"
import type { AppLanguage, LibrarySnapshot, SearchScope, SpokenLanguage } from "../../../library/types.js"
import { Button } from "@/components/ui/button"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { AppBackdrop } from "../AppBackdrop"
import { SettingsDialog } from "../SettingsDialog"
import { ToolPane } from "../ToolPane"
import { t } from "../uiText"
import { LibraryAside } from "./LibraryAside"
import { CourseProgress } from "./CourseProgress"
import { loadComposerOpen, loadShellLayout, saveComposerOpen, saveShellLayout } from "./layout"
import { PlayerStage } from "./PlayerStage"
import type { PromptState } from "./prompt"
import { ShellDialogs } from "./ShellDialogs"
import { jobStatusLine, providerKindLabel } from "./status"
import { Titlebar } from "./Titlebar"

type Props = { snapshot: LibrarySnapshot }

export function Shell({ snapshot }: Props) {
  const lang: AppLanguage = snapshot.appLanguage ?? "fa"
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [actionPanelOpen, setActionPanelOpen] = useState(false)
  const [composerOpen, setComposerOpen] = useState(loadComposerOpen)
  const [query, setQuery] = useState("")
  const [question, setQuestion] = useState("")
  const [scope, setScope] = useState<SearchScope>("video")
  const [note, setNote] = useState("")
  const [stampOn, setStampOn] = useState(true)
  const [media, setMedia] = useState<{ id: string; url: string } | null>(null)
  const [prompt, setPrompt] = useState<PromptState>(null)
  const [sessionDate, setSessionDate] = useState("")
  const [spoken, setSpoken] = useState<SpokenLanguage>(snapshot.spokenLanguageDefault)
  const playAfterSelectId = useRef<string | null>(null)
  const lastPosWrite = useRef(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playbackTime, setPlaybackTime] = useState(0)
  const libraryPanelRef = usePanelRef()
  const toolsPanelRef = usePanelRef()
  const [shellLayout] = useState(loadShellLayout)
  const [libraryOpen, setLibraryOpen] = useState(shellLayout.library > 1)
  const [toolsOpen, setToolsOpen] = useState(shellLayout.tools > 1)
  const nativeGlass = window.doorei.platform === "darwin"
  const selected = snapshot.videos.find((video) => video.id === snapshot.selectedVideoId)
  const courseSessions = snapshot.sessions.filter(
    (session) => session.courseId === snapshot.selectedCourseId
  )

  const languageItems = {
    fa: t(lang, "persian"),
    en: t(lang, "english")
  }

  useEffect(() => {
    setPlaybackTime(selected?.playbackPositionSeconds ?? 0)
  }, [selected?.id])

  useEffect(() => {
    if (playAfterSelectId.current && playAfterSelectId.current !== selected?.id) {
      playAfterSelectId.current = null
    }
  }, [selected?.id])

  useEffect(() => {
    if (!selected || selected.fileMissing) {
      setMedia(null)
      return
    }
    const id = selected.id
    let cancelled = false
    void window.doorei.mediaUrl(selected.path).then((url) => {
      if (!cancelled) setMedia({ id, url })
    })
    return () => {
      cancelled = true
    }
  }, [selected?.id, selected?.path, selected?.fileMissing])

  const caption = snapshot.improvedCaption ?? snapshot.caption
  const jobs = snapshot.jobs.filter(
    (job) => job.status === "queued" || job.status === "running" || job.status === "failed"
  )
  const failedJobs = jobs.filter((job) => job.status === "failed")
  const busyJobs = jobs.some((job) => job.status === "queued" || job.status === "running")
  const rtl = snapshot.direction === "rtl"
  const LibraryToggleIcon = libraryOpen
    ? rtl
      ? PanelRightClose
      : PanelLeftClose
    : rtl
      ? PanelRightOpen
      : PanelLeftOpen
  const ToolsToggleIcon = toolsOpen
    ? rtl
      ? PanelLeftClose
      : PanelRightClose
    : rtl
      ? PanelLeftOpen
      : PanelRightOpen

  function toggleLibrary(): void {
    const panel = libraryPanelRef.current
    if (!panel) return
    if (panel.isCollapsed()) panel.expand()
    else panel.collapse()
  }

  function toggleTools(): void {
    const panel = toolsPanelRef.current
    if (!panel) return
    if (panel.isCollapsed()) panel.expand()
    else panel.collapse()
  }

  useEffect(() => {
    return window.doorei.onShortcut((action) => {
      if (action === "openSettings") setSettingsOpen(true)
      if (action === "toggleActionPanel") setActionPanelOpen((open) => !open)
      if (action === "toggleLibrary") toggleLibrary()
      if (action === "toggleToolPane") toggleTools()
      if (action === "toggleNote") {
        setComposerOpen((open) => {
          const next = !open
          saveComposerOpen(next)
          return next
        })
      }
    })
  }, [])

  async function selectAndPlay(method: "nextVideoId" | "previousVideoId"): Promise<boolean> {
    const id = await window.doorei.call(method)
    if (typeof id !== "string") return false
    playAfterSelectId.current = id
    await window.doorei.call("selectVideo", id)
    return true
  }

  async function addVideos(
    picker: () => Promise<string[]>,
    targetSessionId?: string
  ): Promise<void> {
    const sessionId =
      targetSessionId ?? selected?.sessionId ?? courseSessions[courseSessions.length - 1]?.id
    if (!sessionId) return
    const paths = await picker()
    if (!paths.length) return
    setSpoken(snapshot.spokenLanguageDefault)
    setPrompt({ kind: "spoken", sessionId, paths })
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <AppBackdrop nativeGlass={nativeGlass} />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <Titlebar
          snapshot={snapshot}
          lang={lang}
          nativeGlass={nativeGlass}
          libraryOpen={libraryOpen}
          toolsOpen={toolsOpen}
          actionPanelOpen={actionPanelOpen}
          setActionPanelOpen={setActionPanelOpen}
          setSettingsOpen={setSettingsOpen}
          setComposerOpen={setComposerOpen}
          toggleLibrary={toggleLibrary}
          toggleTools={toggleTools}
          setPrompt={setPrompt}
          LibraryToggleIcon={LibraryToggleIcon}
          ToolsToggleIcon={ToolsToggleIcon}
        />
        <ResizablePanelGroup
          id="shell"
          orientation="horizontal"
          className="min-h-0 flex-1"
          defaultLayout={shellLayout}
          onLayoutChanged={saveShellLayout}
        >
          <ResizablePanel
            id="library"
            panelRef={libraryPanelRef}
            className="min-h-0 overflow-hidden"
            collapsible
            collapsedSize={0}
            defaultSize="22%"
            minSize="14%"
            maxSize="40%"
            onResize={(size) => setLibraryOpen(size.inPixels > 8)}
          >
            <LibraryAside
              snapshot={snapshot}
              lang={lang}
              setPrompt={setPrompt}
              setSessionDate={setSessionDate}
              setSettingsOpen={setSettingsOpen}
              onAddVideos={addVideos}
            />
          </ResizablePanel>
          {libraryOpen ? <ResizableHandle withHandle /> : null}
          <ResizablePanel id="player" defaultSize="53%" minSize="30%" className="min-h-0">
            <PlayerStage
              snapshot={snapshot}
              lang={lang}
              selected={selected}
              mediaUrl={media?.url ?? null}
              caption={caption}
              videoRef={videoRef}
              playAfterSelect={
                selected
                  ? playAfterMediaReady({
                      selectedId: selected.id,
                      mediaId: media?.id ?? null,
                      playAfterId: playAfterSelectId.current
                    })
                  : false
              }
              composerOpen={composerOpen}
              note={note}
              setNote={setNote}
              stampOn={stampOn}
              setStampOn={setStampOn}
              setPlaybackTime={setPlaybackTime}
              lastPosWrite={lastPosWrite}
              setPrompt={setPrompt}
              selectAndPlay={selectAndPlay}
            />
          </ResizablePanel>
          {toolsOpen ? <ResizableHandle withHandle /> : null}
          <ResizablePanel
            id="tools"
            panelRef={toolsPanelRef}
            className="min-h-0 overflow-hidden"
            collapsible
            collapsedSize={0}
            defaultSize="25%"
            minSize="18%"
            maxSize="46%"
            onResize={(size) => setToolsOpen(size.inPixels > 8)}
          >
            <section className="h-full min-h-0 min-w-0 border-s">
              <ToolPane
                snapshot={snapshot}
                lang={lang}
                query={query}
                setQuery={setQuery}
                question={question}
                setQuestion={setQuestion}
                scope={scope}
                setScope={setScope}
                onSeek={(seconds) => {
                  if (videoRef.current && seconds != null) {
                    videoRef.current.currentTime = seconds
                    setPlaybackTime(seconds)
                  }
                }}
                currentTime={playbackTime}
                onEditNote={(id, text) => setPrompt({ kind: "note", id, text })}
              />
            </section>
          </ResizablePanel>
        </ResizablePanelGroup>
        <footer className="flex items-center justify-between border-t border-white/10 bg-black/50 px-4 py-1 text-xs text-muted-foreground backdrop-blur-xl backdrop-saturate-150">
          <CourseProgress snapshot={snapshot} />
          <span
            className="flex min-w-0 flex-1 items-center justify-center gap-1 px-3"
            title={jobs.length ? jobStatusLine(snapshot, jobs) : undefined}
          >
            <span className="min-w-0 truncate text-center">
              {jobs.length ? jobStatusLine(snapshot, jobs) : null}
            </span>
            {failedJobs.length > 0 && !busyJobs ? (
              <Button
                variant="ghost"
                size="icon-xs"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                title={t(lang, "clearFailedJobs")}
                aria-label={t(lang, "clearFailedJobs")}
                onClick={() => void window.doorei.call("dismissFailedJobs")}
              >
                <X />
              </Button>
            ) : null}
          </span>
          <span>
            {snapshot.providerConfigured
              ? `${t(lang, "providerOn")}: ${providerKindLabel(snapshot.provider?.kind)}`
              : t(lang, "providerOff")}
          </span>
        </footer>
      </div>
      <SettingsDialog
        snapshot={snapshot}
        lang={lang}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
      <ShellDialogs
        snapshot={snapshot}
        lang={lang}
        prompt={prompt}
        setPrompt={setPrompt}
        sessionDate={sessionDate}
        setSessionDate={setSessionDate}
        spoken={spoken}
        setSpoken={setSpoken}
        languageItems={languageItems}
      />
    </div>
  )
}
