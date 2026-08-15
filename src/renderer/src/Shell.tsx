import { useEffect, useRef, useState } from "react"
import {
  FileText,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Settings,
  StickyNote
} from "lucide-react"
import type {
  Activity,
  AppLanguage,
  LibrarySnapshot,
  SearchScope,
  SpokenLanguage
} from "../../library/types.js"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
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
import { LibraryTree } from "./LibraryTree"
import { PromptDialog } from "./PromptDialog"
import { SettingsDialog } from "./SettingsDialog"
import { ToolPane } from "./ToolPane"
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

const ACTIVITIES = [
  ["search", Search],
  ["ask", MessageSquare],
  ["summary", FileText],
  ["notes", StickyNote]
] as const

export function Shell({ snapshot }: Props) {
  const lang: AppLanguage = snapshot.appLanguage ?? "fa"
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [question, setQuestion] = useState("")
  const [scope, setScope] = useState<SearchScope>("video")
  const [note, setNote] = useState("")
  const [stampOn, setStampOn] = useState(true)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [prompt, setPrompt] = useState<PromptState>(null)
  const [sessionDate, setSessionDate] = useState("")
  const [spoken, setSpoken] = useState<SpokenLanguage>(snapshot.spokenLanguageDefault)
  const videoRef = useRef<HTMLVideoElement>(null)
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
    if (!selected || selected.fileMissing) {
      setMediaUrl(null)
      return
    }
    void window.doorei.mediaUrl(selected.path).then(setMediaUrl)
  }, [selected?.id, selected?.path, selected?.fileMissing])

  useEffect(() => {
    const el = videoRef.current
    if (!el || !selected) return
    if (Math.abs(el.currentTime - selected.playbackPositionSeconds) > 1.5) {
      el.currentTime = selected.playbackPositionSeconds
    }
    el.playbackRate = snapshot.settings.playbackSpeed
  }, [selected?.id, mediaUrl, selected?.playbackPositionSeconds, snapshot.settings.playbackSpeed])

  const caption = snapshot.improvedCaption ?? snapshot.caption
  const jobs = snapshot.jobs.filter((job) => job.status === "running" || job.status === "failed")
  const courseItems = Object.fromEntries(snapshot.courses.map((course) => [course.id, course.name]))

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
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize="22%" minSize="14%" maxSize="40%" className="min-h-0">
          <aside className="flex h-full min-h-0 flex-col border-e text-sidebar-foreground">
            <div className="grid gap-2 p-3 pt-8">
              <Select
                value={snapshot.selectedCourseId}
                items={courseItems}
                onValueChange={(value) => {
                  if (value) void window.doorei.call("selectCourse", value)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t(lang, "emptyLibrary")} />
                </SelectTrigger>
                <SelectContent>
                  {snapshot.courses.map((course) => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button className="flex-1" variant="outline" size="sm" onClick={() => setPrompt({ kind: "course" })}>
                  <Plus />
                  {t(lang, "newCourse")}
                </Button>
                {snapshot.selectedCourseId ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" />}>
                      <Pencil />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => setPrompt({ kind: "rename" })}>
                        {t(lang, "renameCourse")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            </div>
            {snapshot.selectedCourseId ? (
              <div className="flex items-center justify-between gap-2 px-3 pt-1 pb-1">
                <span className="truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {snapshot.selectedCourseName ?? t(lang, "sessions")}
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
            ) : null}
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
              className="justify-start rounded-none px-4 py-6"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings />
              {t(lang, "settings")}
            </Button>
          </aside>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="53%" minSize="30%" className="min-h-0">
          <main className="flex h-full min-h-0 flex-col p-4">
            {selected && mediaUrl && !selected.fileMissing ? (
              <video
                ref={videoRef}
                className="max-h-[62%] w-full rounded-xl bg-black"
                src={mediaUrl}
                controls
                onTimeUpdate={(event) => {
                  void window.doorei.call("setPlaybackPosition", event.currentTarget.currentTime)
                }}
                onEnded={() => {
                  void window.doorei.call("markEnded")
                  if (snapshot.settings.confetti) fireConfetti()
                  void window.doorei.call("nextVideoId").then((id) => {
                    if (snapshot.settings.autoplay && typeof id === "string") {
                      void window.doorei.call("selectVideo", id)
                    }
                  })
                }}
              />
            ) : (
              <div className="flex max-h-[62%] flex-1 items-center justify-center rounded-xl border border-dashed text-muted-foreground">
                {selected?.fileMissing ? t(lang, "fileMissing") : t(lang, "noVideo")}
              </div>
            )}
            {caption && snapshot.settings.subtitlesVisible && selected && !selected.fileMissing ? (
              <p className="mt-2 min-h-10 text-center text-sm">
                {activeCaption(
                  caption.segments,
                  videoRef.current?.currentTime ?? selected.playbackPositionSeconds
                )}
              </p>
            ) : null}
            {selected?.fileMissing ? (
              <div className="mt-3 flex gap-2">
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
            <form
              className="mt-auto flex items-end gap-2 pt-3"
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
              <Textarea
                className="min-h-16 flex-1 resize-none"
                placeholder={t(lang, "composerPlaceholder")}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <Label className="flex items-center gap-1 font-normal text-muted-foreground">
                <Checkbox checked={stampOn} onCheckedChange={setStampOn} />
                {t(lang, "timestamp")}
              </Label>
              <Button type="submit">{t(lang, "notes")}</Button>
            </form>
          </main>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="25%" minSize="18%" maxSize="46%" className="min-h-0">
          <div className="flex h-full min-h-0">
            <section className="min-w-0 flex-1 border-s">
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
                  if (videoRef.current && seconds != null) videoRef.current.currentTime = seconds
                }}
                onEditNote={(id, text) => setPrompt({ kind: "note", id, text })}
              />
            </section>
            <nav className="flex w-12 flex-col items-center gap-1 border-s py-3">
              {ACTIVITIES.map(([id, Icon]) => (
                <Tooltip key={id}>
                  <TooltipTrigger
                    render={
                      <Button
                        variant={snapshot.activity === id ? "secondary" : "ghost"}
                        size="icon-sm"
                        onClick={() => void window.doorei.call("setActivity", id satisfies Activity)}
                      />
                    }
                  >
                    <Icon />
                  </TooltipTrigger>
                  <TooltipContent>{t(lang, id)}</TooltipContent>
                </Tooltip>
              ))}
            </nav>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      <footer className="flex items-center justify-between border-t px-4 py-1.5 text-xs text-muted-foreground">
        <span>{snapshot.selectedCourseName ?? t(lang, "appName")}</span>
        <span>
          {jobs.length
            ? jobs
                .map(
                  (job) =>
                    `${job.kind}:${job.status}${job.progress ? ` ${Math.round(job.progress * 100)}%` : ""}${job.error ? ` ${job.error}` : ""}`
                )
                .join(" · ")
            : t(lang, "jobs")}
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

function activeCaption(
  segments: { startSeconds: number; endSeconds: number; text: string }[],
  time: number
): string {
  return segments.find((segment) => time >= segment.startSeconds && time <= segment.endSeconds)?.text ?? ""
}

function fireConfetti(): void {
  const node = document.createElement("div")
  node.textContent = "✦"
  node.style.cssText =
    "position:fixed;inset:0;display:grid;place-items:center;font-size:64px;pointer-events:none;z-index:50"
  document.body.append(node)
  setTimeout(() => node.remove(), 800)
}
