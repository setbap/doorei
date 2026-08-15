import { useEffect, useRef, useState } from "react"
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Settings
} from "lucide-react"
import { usePanelRef } from "react-resizable-panels"
import type {
  AppLanguage,
  Job,
  LibrarySnapshot,
  SearchScope,
  SpokenLanguage
} from "../../library/types.js"
import { textDirection } from "../../library/textDirection.js"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from "@/components/ui/resizable"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { AppBackdrop } from "./AppBackdrop"
import { CourseCommand } from "./CourseCommand"
import { LibraryTree } from "./LibraryTree"
import { PromptDialog } from "./PromptDialog"
import { SettingsDialog } from "./SettingsDialog"
import { Player } from "./Player"
import { ToolPane } from "./ToolPane"
import { cn } from "@/lib/utils"
import { t } from "./uiText"

type Props = { snapshot: LibrarySnapshot }

type PromptState =
  | { kind: "course" }
  | { kind: "rename" }
  | { kind: "session" }
  | { kind: "note"; id: string; text: string }
  | { kind: "from-folder"; toDir: string }
  | { kind: "spoken"; sessionId: string; paths: string[] }
  | null

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
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
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
      setMediaUrl(null)
      return
    }
    void window.doorei.mediaUrl(selected.path).then(setMediaUrl)
  }, [selected?.id, selected?.path, selected?.fileMissing])

  const caption = snapshot.improvedCaption ?? snapshot.caption
  const jobs = snapshot.jobs.filter(
    (job) => job.status === "queued" || job.status === "running" || job.status === "failed"
  )
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
      <header
        className={cn(
          "titlebar relative flex h-11 shrink-0 items-center justify-between border-b border-white/10 bg-black/50 pe-2 backdrop-blur-xl backdrop-saturate-150",
          nativeGlass ? "pl-[76px]" : "ps-2"
        )}
      >
        <span className="titlebar-control">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  aria-expanded={libraryOpen}
                  aria-label={t(lang, libraryOpen ? "hideLibrary" : "showLibrary")}
                  onClick={toggleLibrary}
                />
              }
            >
              <LibraryToggleIcon />
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t(lang, libraryOpen ? "hideLibrary" : "showLibrary")}
            </TooltipContent>
          </Tooltip>
        </span>
        <span className="titlebar-control absolute start-1/2 top-1/2 -translate-x-1/2 rtl:translate-x-1/2 -translate-y-1/2">
          <CourseCommand
            snapshot={snapshot}
            lang={lang}
            open={actionPanelOpen}
            onOpenChange={setActionPanelOpen}
            onNewCourse={() => setPrompt({ kind: "course" })}
            onRenameCourse={() => setPrompt({ kind: "rename" })}
            onOpenSettings={() => setSettingsOpen(true)}
            onToggleNote={() => {
              setComposerOpen((open) => {
                const next = !open
                saveComposerOpen(next)
                return next
              })
            }}
            onToggleLibrary={toggleLibrary}
            onToggleToolPane={toggleTools}
          />
        </span>
        <span className="titlebar-control">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  aria-expanded={toolsOpen}
                  aria-label={t(lang, toolsOpen ? "hideToolPane" : "showToolPane")}
                  onClick={toggleTools}
                />
              }
            >
              <ToolsToggleIcon />
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t(lang, toolsOpen ? "hideToolPane" : "showToolPane")}
            </TooltipContent>
          </Tooltip>
        </span>
      </header>
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
          <aside className="flex h-full min-h-0 flex-col overflow-hidden border-e text-sidebar-foreground">
            {snapshot.selectedCourseId ? (
              <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-1">
                <span className="truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t(lang, "sessions")}
                </span>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => {
                          setSessionDate("")
                          setPrompt({ kind: "session" })
                        }}
                      />
                    }
                  >
                    <Plus />
                  </TooltipTrigger>
                  <TooltipContent>{t(lang, "newSession")}</TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <p className="px-3 pt-3 pb-1 text-xs text-muted-foreground">{t(lang, "emptyLibrary")}</p>
            )}
            <ScrollArea className="min-h-0 flex-1 px-2 pb-2">
              <LibraryTree
                snapshot={snapshot}
                lang={lang}
                onAddVideos={(sessionId, picker) => void addVideos(picker, sessionId)}
              />
            </ScrollArea>
            <Separator />
            <Button
              variant="ghost"
              className="h-10 shrink-0 justify-start rounded-none px-4"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings />
              {t(lang, "settings")}
            </Button>
          </aside>
        </ResizablePanel>
        {libraryOpen ? <ResizableHandle withHandle /> : null}
        <ResizablePanel id="player" defaultSize="53%" minSize="30%" className="min-h-0">
          <main className="flex h-full min-h-0 flex-col">
            <div className="relative min-h-0 flex-1 bg-black">
              {selected && mediaUrl && !selected.fileMissing ? (
                <Player
                  key={selected.id}
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
                  playAfterSelect={playAfterSelectId.current === selected.id}
                  onTimeUpdate={(time) => {
                    setPlaybackTime(time)
                    const now = Date.now()
                    if (now - lastPosWrite.current < 800) return
                    lastPosWrite.current = now
                    void window.doorei.call("setPlaybackPosition", time)
                  }}
                  onEnded={() => {
                    void window.doorei.call("markEnded")
                    if (snapshot.settings.confetti) fireConfetti()
                    if (snapshot.settings.autoplay) void selectAndPlay("nextVideoId")
                  }}
                  onPlaybackSpeedChange={(speed) => {
                    void window.doorei.call("updateSettings", { playbackSpeed: speed })
                  }}
                  onSubtitlesVisibleChange={(visible) => {
                    void window.doorei.call("updateSettings", { subtitlesVisible: visible })
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
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                  <span>{selected?.fileMissing ? t(lang, "fileMissing") : t(lang, "noVideo")}</span>
                  {selected?.fileMissing ? (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const path = await window.doorei.pickFile()
                          if (path && selected) void window.doorei.call("relinkVideo", selected.id, path)
                        }}
                      >
                        {t(lang, "relink")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const toDir = await window.doorei.pickDirectory()
                          if (toDir) setPrompt({ kind: "from-folder", toDir })
                        }}
                      >
                        {t(lang, "relinkFolder")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
            {composerOpen ? (
              <form
                className="grid h-44 shrink-0 grid-rows-[minmax(0,1fr)_auto] border-t"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!note.trim() || !selected) return
                  const timestampSeconds = stampOn
                    ? (videoRef.current?.currentTime ?? selected.playbackPositionSeconds)
                    : null
                  void window.doorei.call("addNote", { text: note.trim(), timestampSeconds })
                  setNote("")
                }}
              >
                <div className="min-h-0 px-3 pt-2">
                  <Textarea
                    className="h-full min-h-0 resize-none border-0 bg-transparent p-0 shadow-none field-sizing-fixed focus-visible:ring-0 dark:bg-transparent"
                    placeholder={t(lang, "composerPlaceholder")}
                    value={note}
                    dir={note.trim() ? textDirection(note) : "auto"}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between border-t px-3 py-2">
                  <Label className="font-normal text-muted-foreground">
                    <Checkbox
                      checked={stampOn}
                      onCheckedChange={(checked) => setStampOn(checked === true)}
                    />
                    {t(lang, "timestamp")}
                  </Label>
                  <Button type="submit" disabled={!note.trim() || !selected}>
                    {t(lang, "save")}
                  </Button>
                </div>
              </form>
            ) : null}
          </main>
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
        <span>{snapshot.selectedCourseName ?? t(lang, "appName")}</span>
        <span className="min-w-0 flex-1 truncate px-3 text-center" title={jobStatusLine(snapshot, jobs)}>
          {jobs.length ? jobStatusLine(snapshot, jobs) : t(lang, "jobs")}
        </span>
        <span>
          {snapshot.providerConfigured ? t(lang, "providerOn") : t(lang, "providerOff")}
          {selected ? ` · ${Math.floor(selected.playbackPositionSeconds)}s` : ""}
        </span>
      </footer>
      </div>
      <SettingsDialog
        snapshot={snapshot}
        lang={lang}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
      <PromptDialog
        open={prompt?.kind === "course"}
        title={t(lang, "newCourse")}
        label={t(lang, "courseName")}
        submitLabel={t(lang, "create")}
        cancelLabel={t(lang, "cancel")}
        onOpenChange={(open) => {
          if (!open) setPrompt(null)
        }}
        onSubmit={(name) => void window.doorei.call("createCourse", name)}
      />
      <PromptDialog
        open={prompt?.kind === "rename"}
        title={t(lang, "renameCourse")}
        label={t(lang, "courseName")}
        submitLabel={t(lang, "save")}
        cancelLabel={t(lang, "cancel")}
        defaultValue={snapshot.selectedCourseName ?? ""}
        onOpenChange={(open) => {
          if (!open) setPrompt(null)
        }}
        onSubmit={(name) => {
          if (snapshot.selectedCourseId) {
            void window.doorei.call("renameCourse", snapshot.selectedCourseId, name)
          }
        }}
      />
      <PromptDialog
        open={prompt?.kind === "session"}
        title={t(lang, "newSession")}
        label={t(lang, "sessionName")}
        submitLabel={t(lang, "create")}
        cancelLabel={t(lang, "cancel")}
        extra={
          <div className="grid gap-2">
            <Label htmlFor="session-date">{t(lang, "optionalDate")}</Label>
            <Input
              id="session-date"
              value={sessionDate}
              onChange={(event) => setSessionDate(event.target.value)}
            />
          </div>
        }
        onOpenChange={(open) => {
          if (!open) setPrompt(null)
        }}
        onSubmit={(name) =>
          void window.doorei.call("createSession", {
            name,
            date: sessionDate.trim() || undefined
          })
        }
      />
      <PromptDialog
        open={prompt?.kind === "note"}
        title={t(lang, "editNote")}
        label={t(lang, "notes")}
        submitLabel={t(lang, "save")}
        cancelLabel={t(lang, "cancel")}
        defaultValue={prompt?.kind === "note" ? prompt.text : ""}
        onOpenChange={(open) => {
          if (!open) setPrompt(null)
        }}
        onSubmit={(text) => {
          if (prompt?.kind === "note") void window.doorei.call("editNote", prompt.id, text)
        }}
      />
      <PromptDialog
        open={prompt?.kind === "from-folder"}
        title={t(lang, "relinkFolder")}
        label={t(lang, "fromFolder")}
        submitLabel={t(lang, "relink")}
        cancelLabel={t(lang, "cancel")}
        onOpenChange={(open) => {
          if (!open) setPrompt(null)
        }}
        onSubmit={(fromDir) => {
          if (prompt?.kind === "from-folder") {
            void window.doorei.call("relinkFolder", fromDir, prompt.toDir)
          }
        }}
      />
      <Dialog
        open={prompt?.kind === "spoken"}
        onOpenChange={(open) => {
          if (!open) setPrompt(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t(lang, "spokenLanguage")}</DialogTitle>
          </DialogHeader>
          <Select
            value={spoken}
            items={languageItems}
            onValueChange={(value) => {
              if (value === "fa" || value === "en") setSpoken(value)
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fa">{languageItems.fa}</SelectItem>
              <SelectItem value="en">{languageItems.en}</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrompt(null)}>
              {t(lang, "cancel")}
            </Button>
            <Button
              onClick={() => {
                if (prompt?.kind !== "spoken") return
                void window.doorei.call("addVideos", {
                  sessionId: prompt.sessionId,
                  paths: prompt.paths,
                  spokenLanguage: spoken
                })
                setPrompt(null)
              }}
            >
              {t(lang, "addVideos")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function fireConfetti(): void {
  const node = document.createElement("div")
  node.textContent = "✦"
  node.style.cssText =
    "position:fixed;inset:0;display:grid;place-items:center;font-size:64px;pointer-events:none;z-index:50"
  document.body.append(node)
  setTimeout(() => node.remove(), 800)
}

const SHELL_LAYOUT_KEY = "doorei.shell-layout"
const COMPOSER_OPEN_KEY = "doorei.composer-open"
const DEFAULT_SHELL_LAYOUT = { library: 22, player: 53, tools: 25 }

function jobStatusLine(snapshot: LibrarySnapshot, jobs: Job[]): string {
  return jobs
    .map((job) => {
      const name = snapshot.videos.find((video) => video.id === job.videoId)?.name
      const file = name ? ` ${name}` : ""
      const percent = job.progress ? ` ${Math.round(job.progress * 100)}%` : ""
      const error = job.error ? ` ${job.error}` : ""
      return `${job.kind}:${job.status}${file}${percent}${error}`
    })
    .join(" · ")
}

function loadComposerOpen(): boolean {
  try {
    return localStorage.getItem(COMPOSER_OPEN_KEY) !== "0"
  } catch {
    return true
  }
}

function saveComposerOpen(open: boolean): void {
  try {
    localStorage.setItem(COMPOSER_OPEN_KEY, open ? "1" : "0")
  } catch {
    /* quota or private mode */
  }
}

function loadShellLayout(): { library: number; player: number; tools: number } {
  try {
    const raw = localStorage.getItem(SHELL_LAYOUT_KEY)
    if (!raw) return DEFAULT_SHELL_LAYOUT
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return DEFAULT_SHELL_LAYOUT
    const record = parsed as Record<string, unknown>
    const library = record.library
    const player = record.player
    const tools = record.tools
    if (
      typeof library !== "number" ||
      typeof player !== "number" ||
      typeof tools !== "number" ||
      !Number.isFinite(library) ||
      !Number.isFinite(player) ||
      !Number.isFinite(tools)
    ) {
      return DEFAULT_SHELL_LAYOUT
    }
    return { library, player, tools }
  } catch {
    return DEFAULT_SHELL_LAYOUT
  }
}

function saveShellLayout(layout: { [panelId: string]: number }): void {
  try {
    localStorage.setItem(SHELL_LAYOUT_KEY, JSON.stringify(layout))
  } catch {
    /* quota or private mode */
  }
}
