import { useEffect, useMemo, useRef, useState } from "react"
import {
  FileText,
  MessageSquare,
  Search,
  Settings,
  StickyNote
} from "lucide-react"
import type {
  Activity,
  LibrarySnapshot,
  SearchScope,
  SpokenLanguage
} from "../../library/types.js"
import { t } from "./uiText"

type Props = { snapshot: LibrarySnapshot }

export function Shell({ snapshot }: Props) {
  const lang = snapshot.appLanguage ?? "fa"
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [question, setQuestion] = useState("")
  const [scope, setScope] = useState<SearchScope>("video")
  const [note, setNote] = useState("")
  const [stampOn, setStampOn] = useState(true)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [rightExpanded, setRightExpanded] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const selected = snapshot.videos.find((video) => video.id === snapshot.selectedVideoId)

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

  const sessions = snapshot.sessions
  const videosBySession = useMemo(() => {
    const map = new Map<string, typeof snapshot.videos>()
    for (const video of snapshot.videos) {
      const list = map.get(video.sessionId) ?? []
      list.push(video)
      map.set(video.sessionId, list)
    }
    return map
  }, [snapshot.videos])

  const caption = snapshot.improvedCaption ?? snapshot.caption
  const jobs = snapshot.jobs.filter((job) => job.status === "running" || job.status === "failed")

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <aside className="glass flex w-72 shrink-0 flex-col border-white/10 pt-8 ltr:border-r rtl:border-l">
          <div className="px-3 pb-3">
            <select
              className="w-full rounded-lg border border-white/10 bg-zinc-900/80 px-2 py-2 text-sm"
              value={snapshot.selectedCourseId ?? ""}
              onChange={(event) => {
                if (event.target.value) void window.doorei.call("selectCourse", event.target.value)
              }}
            >
              {snapshot.courses.length === 0 ? (
                <option value="">{t(lang, "emptyLibrary")}</option>
              ) : null}
              {snapshot.courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
            <button
              className="mt-2 w-full rounded-lg border border-white/10 px-2 py-1.5 text-sm"
              onClick={() => {
                const name = window.prompt(t(lang, "courseName"))
                if (name) void window.doorei.call("createCourse", name)
              }}
            >
              {t(lang, "newCourse")}
            </button>
            {snapshot.selectedCourseId ? (
              <button
                className="mt-2 w-full rounded-lg border border-white/10 px-2 py-1.5 text-sm"
                onClick={() => {
                  const name = window.prompt(t(lang, "courseName"), snapshot.selectedCourseName ?? "")
                  if (name && snapshot.selectedCourseId) {
                    void window.doorei.call("renameCourse", snapshot.selectedCourseId, name)
                  }
                }}
              >
                {t(lang, "courseName")}
              </button>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-2">
            {sessions.map((session) => (
              <div key={session.id} className="mb-3">
                <div className="px-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {session.name}
                  {session.date ? ` · ${session.date}` : ""}
                </div>
                {(videosBySession.get(session.id) ?? []).map((video) => (
                  <button
                    key={video.id}
                    className={`mt-1 flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-start text-sm ${
                      video.id === snapshot.selectedVideoId ? "bg-white/10" : "hover:bg-white/5"
                    }`}
                    onClick={() => void window.doorei.call("selectVideo", video.id)}
                  >
                    <span className="truncate">{video.name}</span>
                    {video.watched ? <span className="text-emerald-400">✓</span> : null}
                    {video.fileMissing ? <span className="text-amber-400">!</span> : null}
                  </button>
                ))}
              </div>
            ))}
            {snapshot.selectedCourseId ? (
              <div className="space-y-2 px-2 pb-4">
                <button
                  className="w-full rounded-lg border border-white/10 px-2 py-1.5 text-sm"
                  onClick={() => {
                    const name = window.prompt(t(lang, "sessionName"))
                    if (!name) return
                    const date = window.prompt(t(lang, "optionalDate")) || undefined
                    void window.doorei.call("createSession", { name, date })
                  }}
                >
                  {t(lang, "newSession")}
                </button>
                <button
                  className="w-full rounded-lg border border-white/10 px-2 py-1.5 text-sm"
                  onClick={async () => {
                    const sessionId =
                      selected?.sessionId ?? snapshot.sessions[snapshot.sessions.length - 1]?.id
                    if (!sessionId) return
                    const paths = await window.doorei.pickVideos()
                    if (paths.length) {
                      const spoken = window.prompt(
                        `${t(lang, "spokenDefault")} (fa/en)`,
                        snapshot.spokenLanguageDefault
                      ) as SpokenLanguage | null
                      void window.doorei.call("addVideos", {
                        sessionId,
                        paths,
                        spokenLanguage: spoken === "en" || spoken === "fa" ? spoken : undefined
                      })
                    }
                  }}
                >
                  {t(lang, "addVideos")}
                </button>
                <button
                  className="w-full rounded-lg border border-white/10 px-2 py-1.5 text-sm"
                  onClick={async () => {
                    const sessionId =
                      selected?.sessionId ?? snapshot.sessions[snapshot.sessions.length - 1]?.id
                    if (!sessionId) return
                    const paths = await window.doorei.pickFolderVideos()
                    if (paths.length) {
                      const spoken = window.prompt(
                        `${t(lang, "spokenDefault")} (fa/en)`,
                        snapshot.spokenLanguageDefault
                      ) as SpokenLanguage | null
                      void window.doorei.call("addVideos", {
                        sessionId,
                        paths,
                        spokenLanguage: spoken === "en" || spoken === "fa" ? spoken : undefined
                      })
                    }
                  }}
                >
                  {t(lang, "addFolder")}
                </button>
              </div>
            ) : null}
          </div>
          <button
            className="flex items-center gap-2 border-t border-white/10 px-4 py-3 text-sm text-zinc-300"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={16} />
            {t(lang, "settings")}
          </button>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col p-4">
            {selected && mediaUrl && !selected.fileMissing ? (
              <video
                ref={videoRef}
                className="max-h-[62%] w-full rounded-xl bg-black"
                src={mediaUrl}
                controls
                onTimeUpdate={(event) => {
                  const seconds = event.currentTarget.currentTime
                  void window.doorei.call("setPlaybackPosition", seconds)
                }}
                onEnded={() => {
                  void window.doorei.call("markEnded")
                  if (snapshot.settings.confetti) fireConfetti()
                  const nextId = snapshot.videos.length
                    ? /* next computed in main */ null
                    : null
                  void window.doorei.call("nextVideoId").then((id) => {
                    if (snapshot.settings.autoplay && typeof id === "string") {
                      void window.doorei.call("selectVideo", id)
                    }
                  })
                  void nextId
                }}
              >
                {snapshot.settings.subtitlesVisible && caption
                  ? caption.segments.map((segment, index) => (
                      <track
                        key={`${segment.startSeconds}-${index}`}
                        kind="captions"
                        label="Caption"
                      />
                    ))
                  : null}
              </video>
            ) : (
              <div className="flex max-h-[62%] flex-1 items-center justify-center rounded-xl border border-dashed border-white/10 text-zinc-500">
                {selected?.fileMissing ? t(lang, "fileMissing") : t(lang, "noVideo")}
              </div>
            )}
            {caption && snapshot.settings.subtitlesVisible && selected && !selected.fileMissing ? (
              <p className="mt-2 min-h-10 text-center text-sm text-zinc-200">
                {activeCaption(caption.segments, videoRef.current?.currentTime ?? selected.playbackPositionSeconds)}
              </p>
            ) : null}
            {selected?.fileMissing ? (
              <div className="mt-3 flex gap-2">
                <button
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-sm"
                  onClick={async () => {
                    const path = await window.doorei.pickFile()
                    if (path && selected) void window.doorei.call("relinkVideo", selected.id, path)
                  }}
                >
                  {t(lang, "relink")}
                </button>
                <button
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-sm"
                  onClick={async () => {
                    const fromDir = window.prompt("From folder prefix")
                    const toDir = await window.doorei.pickDirectory()
                    if (fromDir && toDir) void window.doorei.call("relinkFolder", fromDir, toDir)
                  }}
                >
                  {t(lang, "relinkFolder")}
                </button>
              </div>
            ) : null}
            <form
              className="mt-auto flex items-end gap-2 pt-3"
              onSubmit={(event) => {
                event.preventDefault()
                if (!note.trim() || !selected) return
                const timestampSeconds = stampOn ? (videoRef.current?.currentTime ?? selected.playbackPositionSeconds) : null
                void window.doorei.call("addNote", { text: note.trim(), timestampSeconds })
                setNote("")
              }}
            >
              <textarea
                className="min-h-16 flex-1 resize-none rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2"
                placeholder={t(lang, "composerPlaceholder")}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <label className="flex items-center gap-1 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={stampOn}
                  onChange={(event) => setStampOn(event.target.checked)}
                />
                {t(lang, "timestamp")}
              </label>
              <button className="rounded-lg bg-sky-500 px-3 py-2 text-sm text-zinc-950">
                {t(lang, "notes")}
              </button>
            </form>
          </div>
        </main>

        <div className={`flex shrink-0 ${rightExpanded ? "w-[28rem]" : "w-96"}`}>
          <section className="glass min-w-0 flex-1 border-white/10 ltr:border-l rtl:border-r">
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
            />
          </section>
          <nav className="flex w-12 flex-col items-center gap-2 border-white/10 py-3 ltr:border-l rtl:border-r">
            {(
              [
                ["search", Search],
                ["ask", MessageSquare],
                ["summary", FileText],
                ["notes", StickyNote]
              ] as const
            ).map(([id, Icon]) => (
              <button
                key={id}
                title={t(lang, id)}
                className={`rounded-lg p-2 ${snapshot.activity === id ? "bg-white/15 text-sky-300" : "text-zinc-400"}`}
                onClick={() => {
                  void window.doorei.call("setActivity", id satisfies Activity)
                  if (snapshot.activity === id) setRightExpanded((value) => !value)
                }}
              >
                <Icon size={18} />
              </button>
            ))}
          </nav>
        </div>
      </div>
      <footer className="flex items-center justify-between border-t border-white/10 px-4 py-1.5 text-xs text-zinc-500">
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
          {snapshot.providerConfigured ? "Provider" : "No Provider"}
          {selected ? ` · ${Math.floor(selected.playbackPositionSeconds)}s` : ""}
        </span>
      </footer>
      {settingsOpen ? (
        <SettingsModal snapshot={snapshot} lang={lang} onClose={() => setSettingsOpen(false)} />
      ) : null}
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
  node.style.cssText = "position:fixed;inset:0;display:grid;place-items:center;font-size:64px;pointer-events:none;z-index:50"
  document.body.append(node)
  setTimeout(() => node.remove(), 800)
}

function ToolPane({
  snapshot,
  lang,
  query,
  setQuery,
  question,
  setQuestion,
  scope,
  setScope,
  onSeek
}: {
  snapshot: LibrarySnapshot
  lang: "fa" | "en"
  query: string
  setQuery: (value: string) => void
  question: string
  setQuestion: (value: string) => void
  scope: SearchScope
  setScope: (value: SearchScope) => void
  onSeek: (seconds: number | null) => void
}) {
  const scopes: SearchScope[] = ["video", "session", "course"]
  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-3 flex gap-1 text-xs">
        {scopes.map((item) => (
          <button
            key={item}
            className={`rounded-full px-2 py-1 ${scope === item ? "bg-white/15" : "text-zinc-500"}`}
            onClick={() => setScope(item)}
          >
            {t(lang, item === "video" ? "scopeVideo" : item === "session" ? "scopeSession" : "scopeCourse")}
          </button>
        ))}
      </div>
      {snapshot.activity === "search" ? (
        <>
          <input
            className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm"
            placeholder={t(lang, "searchPlaceholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void window.doorei.call("search", { text: query, scope })
            }}
          />
          <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-auto text-sm">
            {snapshot.searchHits.map((hit, index) => (
              <li key={`${hit.videoId}-${index}`}>
                <button
                  className="w-full rounded-lg bg-white/5 px-2 py-2 text-start"
                  onClick={async () => {
                    await window.doorei.call("selectVideo", hit.videoId)
                    if (hit.startSeconds != null) {
                      await window.doorei.call("setPlaybackPosition", hit.startSeconds)
                      onSeek(hit.startSeconds)
                    }
                  }}
                >
                  <div className="text-xs text-zinc-500">{hit.kind}</div>
                  {hit.text}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {snapshot.activity === "ask" ? (
        snapshot.askOff ? (
          <p className="text-sm text-zinc-500">{t(lang, "askOff")}</p>
        ) : (
          <>
            <textarea
              className="min-h-24 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm"
              placeholder={t(lang, "askPlaceholder")}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />
            <button
              className="mt-2 rounded-lg bg-sky-500 px-3 py-1.5 text-sm text-zinc-950"
              onClick={() => void window.doorei.call("ask", { question, scope })}
            >
              {t(lang, "ask")}
            </button>
            {snapshot.askError ? <p className="mt-2 text-sm text-amber-300">{snapshot.askError}</p> : null}
            {snapshot.askAnswer ? (
              <div className="mt-3 min-h-0 flex-1 overflow-auto text-sm">
                <p>{snapshot.askAnswer.text}</p>
                <ul className="mt-2 space-y-1">
                  {snapshot.askAnswer.hits.map((hit, index) => (
                    <li key={index}>
                      <button
                        className="text-sky-300"
                        onClick={async () => {
                          await window.doorei.call("selectVideo", hit.videoId)
                          if (hit.startSeconds != null) {
                            await window.doorei.call("setPlaybackPosition", hit.startSeconds)
                            onSeek(hit.startSeconds)
                          }
                        }}
                      >
                        {hit.text}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )
      ) : null}
      {snapshot.activity === "summary" ? (
        <div className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap text-sm leading-6">
          {snapshot.summary ?? t(lang, "noSummary")}
        </div>
      ) : null}
      {snapshot.activity === "notes" ? (
        <ul className="min-h-0 flex-1 space-y-2 overflow-auto text-sm">
          {snapshot.notes.length === 0 ? <p className="text-zinc-500">{t(lang, "noNotes")}</p> : null}
          {snapshot.notes.map((item) => (
            <li key={item.id} className="rounded-lg bg-white/5 px-2 py-2">
              {item.timestampSeconds != null ? (
                <button className="text-xs text-sky-300" onClick={() => onSeek(item.timestampSeconds)}>
                  {Math.floor(item.timestampSeconds)}s
                </button>
              ) : null}
              <p>{item.text}</p>
              <button
                className="text-xs text-zinc-500"
                onClick={() => {
                  const next = window.prompt(t(lang, "notes"), item.text)
                  if (next != null) void window.doorei.call("editNote", item.id, next)
                }}
              >
                {t(lang, "save")}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {snapshot.selectedVideoId ? (
        <div className="mt-auto flex flex-wrap gap-2 border-t border-white/10 pt-3 text-xs">
          <button
            className="rounded-md border border-white/10 px-2 py-1"
            onClick={() =>
              void window.doorei.call("setWatched", snapshot.selectedVideoId, !snapshot.videos.find((v) => v.id === snapshot.selectedVideoId)?.watched)
            }
          >
            {t(lang, "watched")}
          </button>
          <button
            className="rounded-md border border-white/10 px-2 py-1"
            onClick={() =>
              void window.doorei.call("nextVideoId").then((id) => {
                if (typeof id === "string") void window.doorei.call("selectVideo", id)
              })
            }
          >
            {t(lang, "next")}
          </button>
          <button
            className="rounded-md border border-white/10 px-2 py-1"
            onClick={() => void window.doorei.call("regenerateCaption", snapshot.selectedVideoId)}
          >
            {t(lang, "regenerate")}
          </button>
          <button
            className="rounded-md border border-red-400/40 px-2 py-1 text-red-300"
            onClick={() => {
              if (snapshot.selectedVideoId) void window.doorei.call("deleteVideo", snapshot.selectedVideoId)
            }}
          >
            {t(lang, "deleteVideo")}
          </button>
          {snapshot.jobs
            .filter((job) => job.status === "failed")
            .map((job) => (
              <button
                key={job.id}
                className="rounded-md border border-amber-400/40 px-2 py-1 text-amber-200"
                onClick={() => void window.doorei.call("retryJob", job.id)}
              >
                {t(lang, "retry")}: {job.error}
              </button>
            ))}
        </div>
      ) : null}
    </div>
  )
}

function SettingsModal({
  snapshot,
  lang,
  onClose
}: {
  snapshot: LibrarySnapshot
  lang: "fa" | "en"
  onClose: () => void
}) {
  const [url, setUrl] = useState(snapshot.provider?.url ?? "")
  const [key, setKey] = useState(snapshot.provider?.key ?? "")
  const [improve, setImprove] = useState(snapshot.prompts.improve)
  const [summary, setSummary] = useState(snapshot.prompts.summary)
  const [ask, setAsk] = useState(snapshot.prompts.ask)
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-6">
      <div className="glass max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl border border-white/10 p-5">
        <h2 className="text-lg font-medium">{t(lang, "settings")}</h2>
        <div className="mt-4 grid gap-3 text-sm">
          <label className="grid gap-1">
            {t(lang, "outputLanguage")}
            <select
              className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-2"
              value={snapshot.outputLanguage}
              onChange={(event) => void window.doorei.call("setOutputLanguage", event.target.value)}
            >
              <option value="fa">{t(lang, "persian")}</option>
              <option value="en">{t(lang, "english")}</option>
            </select>
          </label>
          <label className="grid gap-1">
            {t(lang, "spokenDefault")}
            <select
              className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-2"
              value={snapshot.spokenLanguageDefault}
              onChange={(event) =>
                void window.doorei.call("setSpokenLanguageDefault", event.target.value)
              }
            >
              <option value="fa">{t(lang, "persian")}</option>
              <option value="en">{t(lang, "english")}</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={snapshot.settings.autoplay}
              onChange={(event) =>
                void window.doorei.call("updateSettings", { autoplay: event.target.checked })
              }
            />
            {t(lang, "autoplay")}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={snapshot.settings.confetti}
              onChange={(event) =>
                void window.doorei.call("updateSettings", { confetti: event.target.checked })
              }
            />
            {t(lang, "confetti")}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={snapshot.settings.subtitlesVisible}
              onChange={(event) =>
                void window.doorei.call("updateSettings", { subtitlesVisible: event.target.checked })
              }
            />
            {t(lang, "subtitles")}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={snapshot.settings.autoMarkWatchedAtEnd}
              onChange={(event) =>
                void window.doorei.call("updateSettings", {
                  autoMarkWatchedAtEnd: event.target.checked
                })
              }
            />
            {t(lang, "watched")}
          </label>
          <label className="grid gap-1">
            {t(lang, "speed")}
            <input
              type="number"
              step="0.25"
              min="0.5"
              max="3"
              className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-2"
              value={snapshot.settings.playbackSpeed}
              onChange={(event) =>
                void window.doorei.call("updateSettings", {
                  playbackSpeed: Number(event.target.value)
                })
              }
            />
          </label>
          <input
            className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-2"
            placeholder={t(lang, "providerUrl")}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <input
            className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-2"
            placeholder={t(lang, "providerKey")}
            type="password"
            value={key}
            onChange={(event) => setKey(event.target.value)}
          />
          <textarea
            className="min-h-20 rounded-lg border border-white/10 bg-zinc-900 px-2 py-2"
            value={improve}
            onChange={(event) => setImprove(event.target.value)}
          />
          <textarea
            className="min-h-20 rounded-lg border border-white/10 bg-zinc-900 px-2 py-2"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
          />
          <textarea
            className="min-h-20 rounded-lg border border-white/10 bg-zinc-900 px-2 py-2"
            value={ask}
            onChange={(event) => setAsk(event.target.value)}
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded-lg px-3 py-1.5" onClick={onClose}>
            {t(lang, "save")}
          </button>
          <button
            className="rounded-lg bg-white px-3 py-1.5 text-zinc-950"
            onClick={() => {
              void window.doorei.call(
                "configureProvider",
                url.trim() ? { kind: "openai", url: url.trim(), key: key.trim() } : null
              )
              void window.doorei.call("updatePrompt", "improve", improve)
              void window.doorei.call("updatePrompt", "summary", summary)
              void window.doorei.call("updatePrompt", "ask", ask)
              onClose()
            }}
          >
            {t(lang, "save")}
          </button>
        </div>
      </div>
    </div>
  )
}
