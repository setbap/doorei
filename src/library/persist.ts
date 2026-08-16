import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import type {
  Activity,
  AppLanguage,
  Caption,
  ConversationRecord,
  ConversationTurn,
  Hit,
  Job,
  Note,
  PlayerSettings,
  ProviderConfig,
  ProviderVault,
  SpokenLanguage,
  VideoRecord
} from "./types.js"

export type StoredConversation = ConversationRecord & {
  courseId: string
  updatedAt: number
  turns: ConversationTurn[]
}

export type LibraryState = {
  appLanguage: AppLanguage | null
  outputLanguage: AppLanguage | null
  provider: ProviderConfig | null
  providerVault: ProviderVault
  spokenLanguageDefault: SpokenLanguage
  settings: PlayerSettings
  prompts: { improve: string; summary: string; ask: string }
  selectedCourseId: string | null
  selectedVideoId: string | null
  activity: Activity
  gatePassed: boolean
  courses: { id: string; name: string }[]
  sessions: { id: string; courseId: string; name: string; date: string | null; position: number }[]
  videos: VideoRecord[]
  notes: Note[]
  captions: Record<string, Caption>
  improvedCaptions: Record<string, Caption>
  summaries: Record<string, string>
  embeddings: Record<string, { segmentIndex: number; vector: number[]; kind: "caption" | "note"; noteId?: string }[]>
  jobs: Job[]
  searchHits: Hit[]
  conversations: StoredConversation[]
  activeConversationByCourse: Record<string, string>
  lastAskError: string | null
}

type EmbeddingRow = {
  segmentIndex: number
  vector: number[]
  kind: "caption" | "note"
  noteId?: string
}

const DEFAULT_PROMPTS = {
  improve:
    "Rewrite this Caption with corrected wording. Keep the same Spoken language. Fix technical terms. Return only a JSON array of strings in the same order, one rewritten text per input. Do not change the number of items. Do not include timestamps.",
  summary:
    "Write a Summary of this Video in the requested Output language so the learner can re-read what it covered without watching. Use Markdown (headings, lists, bold). Return only the Markdown, with no wrapping code fence.",
  ask: "Answer the question using only the provided Hits. Cite those Hits. Write in the requested Output language."
}

const DEFAULT_SETTINGS: PlayerSettings = {
  autoplay: false,
  confetti: false,
  playbackSpeed: 1,
  subtitlesVisible: true,
  autoMarkWatchedAtEnd: true,
  captionColor: "#ffffff",
  captionBackground: "#000000b8",
  askContextBudgetTokens: 24_000
}

export function emptyLibraryState(): LibraryState {
  return {
    appLanguage: null,
    outputLanguage: null,
    provider: null,
    providerVault: {},
    spokenLanguageDefault: "fa",
    settings: { ...DEFAULT_SETTINGS },
    prompts: { ...DEFAULT_PROMPTS },
    selectedCourseId: null,
    selectedVideoId: null,
    activity: "summary",
    gatePassed: false,
    courses: [],
    sessions: [],
    videos: [],
    notes: [],
    captions: {},
    improvedCaptions: {},
    summaries: {},
    embeddings: {},
    jobs: [],
    searchHits: [],
    conversations: [],
    activeConversationByCourse: {},
    lastAskError: null
  }
}

function appPath(dataDir: string): string {
  return join(dataDir, "app.sqlite")
}

function coursePath(dataDir: string, courseId: string): string {
  return join(dataDir, "courses", courseId, "course.sqlite")
}

function jsonPath(dataDir: string): string {
  return join(dataDir, "library.json")
}

function withDb<T>(path: string, fn: (db: DatabaseSync) => T): T {
  mkdirSync(join(path, ".."), { recursive: true })
  const db = new DatabaseSync(path)
  try {
    db.exec("PRAGMA journal_mode = WAL")
    return fn(db)
  } finally {
    db.close()
  }
}

function ensureApp(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      position INTEGER NOT NULL
    );
  `)
}

function ensureCourse(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      date TEXT,
      position INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      path TEXT NOT NULL,
      name TEXT NOT NULL,
      position INTEGER NOT NULL,
      spoken_language TEXT NOT NULL,
      playback_position_seconds REAL NOT NULL,
      watched INTEGER NOT NULL,
      file_missing INTEGER NOT NULL,
      captioning_progress REAL
    );
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL,
      text TEXT NOT NULL,
      timestamp_seconds REAL
    );
    CREATE TABLE IF NOT EXISTS captions (
      video_id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      segments TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS improved_captions (
      video_id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      segments TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS summaries (
      video_id TEXT PRIMARY KEY,
      text TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS embeddings (
      video_id TEXT NOT NULL,
      segment_index INTEGER NOT NULL,
      kind TEXT NOT NULL,
      note_id TEXT,
      vector BLOB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      video_id TEXT NOT NULL,
      status TEXT NOT NULL,
      progress REAL NOT NULL,
      error TEXT
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS turns (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      kind TEXT NOT NULL,
      text TEXT NOT NULL,
      hits TEXT NOT NULL
    );
  `)
}

function kvGet(db: DatabaseSync, key: string): string | null {
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined
  return row?.value ?? null
}

function kvSet(db: DatabaseSync, key: string, value: string): void {
  db.prepare("INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    key,
    value
  )
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function vectorToBlob(vector: number[]): Uint8Array {
  return new Uint8Array(new Float32Array(vector).buffer)
}

function blobToVector(blob: Uint8Array): number[] {
  const copy = blob.byteOffset % 4 === 0 ? blob : new Uint8Array(blob)
  return Array.from(new Float32Array(copy.buffer, copy.byteOffset, Math.floor(copy.byteLength / 4)))
}

function courseIdForVideo(state: LibraryState, videoId: string): string | null {
  const video = state.videos.find((item) => item.id === videoId)
  if (!video) return null
  return state.sessions.find((session) => session.id === video.sessionId)?.courseId ?? null
}

export function loadCourseEmbeddings(dataDir: string, courseId: string): Record<string, EmbeddingRow[]> {
  const path = coursePath(dataDir, courseId)
  if (!existsSync(path)) return {}
  return withDb(path, (db) => {
    ensureCourse(db)
    const rows = db.prepare("SELECT video_id, segment_index, kind, note_id, vector FROM embeddings").all() as {
      video_id: string
      segment_index: number
      kind: "caption" | "note"
      note_id: string | null
      vector: Uint8Array
    }[]
    const embeddings: Record<string, EmbeddingRow[]> = {}
    for (const row of rows) {
      const list = embeddings[row.video_id] ?? []
      list.push({
        segmentIndex: row.segment_index,
        vector: blobToVector(row.vector),
        kind: row.kind,
        ...(row.note_id ? { noteId: row.note_id } : {})
      })
      embeddings[row.video_id] = list
    }
    return embeddings
  })
}

export function saveVideoEmbeddings(
  dataDir: string,
  courseId: string,
  videoId: string,
  rows: EmbeddingRow[]
): void {
  withDb(coursePath(dataDir, courseId), (db) => {
    ensureCourse(db)
    db.prepare("DELETE FROM embeddings WHERE video_id = ?").run(videoId)
    const insert = db.prepare(
      "INSERT INTO embeddings(video_id, segment_index, kind, note_id, vector) VALUES(?, ?, ?, ?, ?)"
    )
    for (const row of rows) {
      insert.run(videoId, row.segmentIndex, row.kind, row.noteId ?? null, vectorToBlob(row.vector))
    }
  })
}

function writeConversationRows(db: DatabaseSync, state: LibraryState, courseId: string): void {
  const insertConversation = db.prepare(
    "INSERT INTO conversations(id, title, updated_at) VALUES(?, ?, ?)"
  )
  const insertTurn = db.prepare(
    "INSERT INTO turns(id, conversation_id, position, kind, text, hits) VALUES(?, ?, ?, ?, ?, ?)"
  )
  for (const conversation of state.conversations.filter((item) => item.courseId === courseId)) {
    insertConversation.run(conversation.id, conversation.title, conversation.updatedAt)
    conversation.turns.forEach((turn, position) => {
      insertTurn.run(
        turn.id,
        conversation.id,
        position,
        turn.kind,
        turn.text,
        JSON.stringify(turn.hits)
      )
    })
  }
}

function writeCourse(dataDir: string, courseId: string, state: LibraryState): void {
  const sessionIds = new Set(
    state.sessions.filter((session) => session.courseId === courseId).map((session) => session.id)
  )
  const videoIds = new Set(
    state.videos.filter((video) => sessionIds.has(video.sessionId)).map((video) => video.id)
  )
  withDb(coursePath(dataDir, courseId), (db) => {
    ensureCourse(db)
    db.exec("DELETE FROM sessions; DELETE FROM videos; DELETE FROM notes; DELETE FROM captions; DELETE FROM improved_captions; DELETE FROM summaries; DELETE FROM jobs; DELETE FROM turns; DELETE FROM conversations;")
    const insertSession = db.prepare("INSERT INTO sessions(id, name, date, position) VALUES(?, ?, ?, ?)")
    for (const session of state.sessions.filter((item) => item.courseId === courseId)) {
      insertSession.run(session.id, session.name, session.date, session.position)
    }
    const insertVideo = db.prepare(
      `INSERT INTO videos(id, session_id, path, name, position, spoken_language, playback_position_seconds, watched, file_missing, captioning_progress)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const video of state.videos.filter((item) => sessionIds.has(item.sessionId))) {
      insertVideo.run(
        video.id,
        video.sessionId,
        video.path,
        video.name,
        video.position,
        video.spokenLanguage,
        video.playbackPositionSeconds,
        video.watched ? 1 : 0,
        video.fileMissing ? 1 : 0,
        video.captioningProgress
      )
    }
    const insertNote = db.prepare("INSERT INTO notes(id, video_id, text, timestamp_seconds) VALUES(?, ?, ?, ?)")
    for (const note of state.notes.filter((item) => videoIds.has(item.videoId))) {
      insertNote.run(note.id, note.videoId, note.text, note.timestampSeconds)
    }
    const insertCaption = db.prepare("INSERT INTO captions(video_id, source, segments) VALUES(?, ?, ?)")
    for (const videoId of videoIds) {
      const caption = state.captions[videoId]
      if (caption) insertCaption.run(videoId, caption.source, JSON.stringify(caption.segments))
    }
    const insertImproved = db.prepare("INSERT INTO improved_captions(video_id, source, segments) VALUES(?, ?, ?)")
    for (const videoId of videoIds) {
      const caption = state.improvedCaptions[videoId]
      if (caption) insertImproved.run(videoId, caption.source, JSON.stringify(caption.segments))
    }
    const insertSummary = db.prepare("INSERT INTO summaries(video_id, text) VALUES(?, ?)")
    for (const videoId of videoIds) {
      const text = state.summaries[videoId]
      if (text) insertSummary.run(videoId, text)
    }
    const insertJob = db.prepare(
      "INSERT INTO jobs(id, kind, video_id, status, progress, error) VALUES(?, ?, ?, ?, ?, ?)"
    )
    for (const job of state.jobs.filter((item) => videoIds.has(item.videoId))) {
      insertJob.run(job.id, job.kind, job.videoId, job.status, job.progress, job.error)
    }
    writeConversationRows(db, state, courseId)
  })
}

function writeEmbeddingsForState(dataDir: string, state: LibraryState): void {
  for (const course of state.courses) {
    const sessionIds = new Set(
      state.sessions.filter((session) => session.courseId === course.id).map((session) => session.id)
    )
    for (const video of state.videos.filter((item) => sessionIds.has(item.sessionId))) {
      const rows = state.embeddings[video.id]
      if (rows) saveVideoEmbeddings(dataDir, course.id, video.id, rows)
    }
  }
}

function writeApp(dataDir: string, state: LibraryState): void {
  withDb(appPath(dataDir), (db) => {
    ensureApp(db)
    db.exec("DELETE FROM courses")
    const insert = db.prepare("INSERT INTO courses(id, name, position) VALUES(?, ?, ?)")
    state.courses.forEach((course, position) => insert.run(course.id, course.name, position))
    kvSet(db, "appLanguage", JSON.stringify(state.appLanguage))
    kvSet(db, "outputLanguage", JSON.stringify(state.outputLanguage))
    kvSet(db, "provider", JSON.stringify(state.provider))
    kvSet(db, "providerVault", JSON.stringify(state.providerVault))
    kvSet(db, "spokenLanguageDefault", JSON.stringify(state.spokenLanguageDefault))
    kvSet(db, "settings", JSON.stringify(state.settings))
    kvSet(db, "prompts", JSON.stringify(state.prompts))
    kvSet(db, "selectedCourseId", JSON.stringify(state.selectedCourseId))
    kvSet(db, "selectedVideoId", JSON.stringify(state.selectedVideoId))
    kvSet(db, "activity", JSON.stringify(state.activity))
    kvSet(db, "gatePassed", JSON.stringify(state.gatePassed))
    kvSet(db, "searchHits", JSON.stringify(state.searchHits))
    kvSet(db, "activeConversationByCourse", JSON.stringify(state.activeConversationByCourse))
    kvSet(db, "lastAskError", JSON.stringify(state.lastAskError))
  })
}

export function saveLibrary(dataDir: string, state: LibraryState): void {
  mkdirSync(dataDir, { recursive: true })
  writeApp(dataDir, state)
  for (const course of state.courses) writeCourse(dataDir, course.id, state)
}

export function savePlayback(dataDir: string, state: LibraryState, videoId: string): void {
  const courseId = courseIdForVideo(state, videoId)
  const video = state.videos.find((item) => item.id === videoId)
  if (!courseId || !video || !existsSync(coursePath(dataDir, courseId))) {
    saveLibrary(dataDir, state)
    return
  }
  writeApp(dataDir, state)
  withDb(coursePath(dataDir, courseId), (db) => {
    ensureCourse(db)
    db.prepare("UPDATE videos SET playback_position_seconds = ?, watched = ? WHERE id = ?").run(
      video.playbackPositionSeconds,
      video.watched ? 1 : 0,
      videoId
    )
  })
}

export function saveConversations(dataDir: string, state: LibraryState, courseId: string): void {
  writeApp(dataDir, state)
  if (!existsSync(coursePath(dataDir, courseId))) {
    saveLibrary(dataDir, state)
    return
  }
  withDb(coursePath(dataDir, courseId), (db) => {
    ensureCourse(db)
    db.exec("DELETE FROM turns; DELETE FROM conversations;")
    writeConversationRows(db, state, courseId)
  })
}

export function deleteCourseData(dataDir: string, courseId: string): void {
  rmSync(join(dataDir, "courses", courseId), { recursive: true, force: true })
}

function loadCourseFile(dataDir: string, courseId: string, state: LibraryState): void {
  const path = coursePath(dataDir, courseId)
  if (!existsSync(path)) return
  withDb(path, (db) => {
    ensureCourse(db)
    const sessions = db.prepare("SELECT id, name, date, position FROM sessions").all() as {
      id: string
      name: string
      date: string | null
      position: number
    }[]
    for (const session of sessions) {
      state.sessions.push({
        id: session.id,
        courseId,
        name: session.name,
        date: session.date,
        position: session.position
      })
    }
    const videos = db.prepare(
      "SELECT id, session_id, path, name, position, spoken_language, playback_position_seconds, watched, file_missing, captioning_progress FROM videos"
    ).all() as {
      id: string
      session_id: string
      path: string
      name: string
      position: number
      spoken_language: SpokenLanguage
      playback_position_seconds: number
      watched: number
      file_missing: number
      captioning_progress: number | null
    }[]
    for (const video of videos) {
      state.videos.push({
        id: video.id,
        sessionId: video.session_id,
        path: video.path,
        name: video.name,
        position: video.position,
        spokenLanguage: video.spoken_language,
        playbackPositionSeconds: video.playback_position_seconds,
        watched: Boolean(video.watched),
        fileMissing: Boolean(video.file_missing),
        captioningProgress: video.captioning_progress,
        hasSummary: false
      })
    }
    const notes = db.prepare("SELECT id, video_id, text, timestamp_seconds FROM notes").all() as {
      id: string
      video_id: string
      text: string
      timestamp_seconds: number | null
    }[]
    for (const note of notes) {
      state.notes.push({
        id: note.id,
        videoId: note.video_id,
        text: note.text,
        timestampSeconds: note.timestamp_seconds
      })
    }
    const captions = db.prepare("SELECT video_id, source, segments FROM captions").all() as {
      video_id: string
      source: Caption["source"]
      segments: string
    }[]
    for (const row of captions) {
      state.captions[row.video_id] = { source: row.source, segments: JSON.parse(row.segments) }
    }
    const improved = db.prepare("SELECT video_id, source, segments FROM improved_captions").all() as {
      video_id: string
      source: Caption["source"]
      segments: string
    }[]
    for (const row of improved) {
      state.improvedCaptions[row.video_id] = { source: row.source, segments: JSON.parse(row.segments) }
    }
    const summaries = db.prepare("SELECT video_id, text FROM summaries").all() as {
      video_id: string
      text: string
    }[]
    for (const row of summaries) {
      state.summaries[row.video_id] = row.text
    }
    const jobs = db.prepare("SELECT id, kind, video_id, status, progress, error FROM jobs").all() as {
      id: string
      kind: Job["kind"]
      video_id: string
      status: Job["status"]
      progress: number
      error: string | null
    }[]
    for (const job of jobs) {
      state.jobs.push({
        id: job.id,
        kind: job.kind,
        videoId: job.video_id,
        status: job.status,
        progress: job.progress,
        error: job.error
      })
    }
    const conversations = db.prepare("SELECT id, title, updated_at FROM conversations").all() as {
      id: string
      title: string
      updated_at: number
    }[]
    const turns = db.prepare(
      "SELECT id, conversation_id, position, kind, text, hits FROM turns ORDER BY position"
    ).all() as {
      id: string
      conversation_id: string
      position: number
      kind: ConversationTurn["kind"]
      text: string
      hits: string
    }[]
    for (const conversation of conversations) {
      state.conversations.push({
        id: conversation.id,
        courseId,
        title: conversation.title,
        updatedAt: conversation.updated_at,
        turns: turns
          .filter((turn) => turn.conversation_id === conversation.id)
          .map((turn) => ({
            id: turn.id,
            kind: turn.kind,
            text: turn.text,
            hits: parseJson(turn.hits, [])
          }))
      })
    }
  })
}

function loadSqlite(dataDir: string): LibraryState {
  const state = emptyLibraryState()
  withDb(appPath(dataDir), (db) => {
    ensureApp(db)
    state.appLanguage = parseJson(kvGet(db, "appLanguage"), null)
    state.outputLanguage = parseJson(kvGet(db, "outputLanguage"), null)
    state.provider = parseJson(kvGet(db, "provider"), null)
    state.providerVault = parseJson(kvGet(db, "providerVault"), {})
    state.spokenLanguageDefault = parseJson(kvGet(db, "spokenLanguageDefault"), "fa")
    state.settings = { ...DEFAULT_SETTINGS, ...parseJson(kvGet(db, "settings"), {}) }
    state.prompts = { ...DEFAULT_PROMPTS, ...parseJson(kvGet(db, "prompts"), {}) }
    state.selectedCourseId = parseJson(kvGet(db, "selectedCourseId"), null)
    state.selectedVideoId = parseJson(kvGet(db, "selectedVideoId"), null)
    state.activity = parseJson(kvGet(db, "activity"), "summary")
    state.gatePassed = parseJson(kvGet(db, "gatePassed"), false)
    state.searchHits = parseJson(kvGet(db, "searchHits"), [])
    state.activeConversationByCourse = parseJson(kvGet(db, "activeConversationByCourse"), {})
    state.lastAskError = parseJson(kvGet(db, "lastAskError"), null)
    const courses = db.prepare("SELECT id, name, position FROM courses ORDER BY position").all() as {
      id: string
      name: string
      position: number
    }[]
    state.courses = courses.map((course) => ({ id: course.id, name: course.name }))
  })
  for (const course of state.courses) loadCourseFile(dataDir, course.id, state)
  if (state.selectedCourseId) {
    state.embeddings = loadCourseEmbeddings(dataDir, state.selectedCourseId)
  }
  for (const video of state.videos) {
    video.hasSummary = Boolean(state.summaries[video.id])
  }
  return state
}

function loadJsonFile(dataDir: string): LibraryState | null {
  try {
    const loaded = JSON.parse(readFileSync(jsonPath(dataDir), "utf8")) as Partial<LibraryState>
    return {
      ...emptyLibraryState(),
      ...loaded,
      settings: { ...DEFAULT_SETTINGS, ...loaded.settings },
      prompts: { ...DEFAULT_PROMPTS, ...loaded.prompts }
    }
  } catch {
    return null
  }
}

export function loadLibrary(dataDir: string): LibraryState {
  if (existsSync(appPath(dataDir))) return loadSqlite(dataDir)
  const fromJson = existsSync(jsonPath(dataDir)) ? loadJsonFile(dataDir) : null
  if (!fromJson) return emptyLibraryState()
  saveLibrary(dataDir, fromJson)
  writeEmbeddingsForState(dataDir, fromJson)
  try {
    unlinkSync(jsonPath(dataDir))
  } catch {
    /* still migrated */
  }
  return fromJson
}
