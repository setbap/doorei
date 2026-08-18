import { existsSync, readFileSync, unlinkSync } from "node:fs"
import { hydrateCourse, type LegacyCourseGlobals } from "../courseSettings.js"
import { DEFAULT_SETTINGS } from "../defaults.js"
import type { Caption, ConversationTurn, CoursePrompts, Job, SpokenLanguage } from "../types.js"
import { ensureApp, ensureCourse, kvGet, parseJson, withDb } from "./db.js"
import { emptyLibraryState } from "./empty.js"
import { loadCourseEmbeddings } from "./embeddings.js"
import { appPath, coursePath, jsonPath } from "./paths.js"
import { saveLibrary } from "./save.js"
import type { LibraryState } from "./types.js"
import { writeEmbeddingsForState } from "./write.js"

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
  let needsPersist = false
  withDb(appPath(dataDir), (db) => {
    ensureApp(db)
    state.appLanguage = parseJson(kvGet(db, "appLanguage"), null)
    state.provider = parseJson(kvGet(db, "provider"), null)
    state.providerVault = parseJson(kvGet(db, "providerVault"), {})
    state.settings = { ...DEFAULT_SETTINGS, ...parseJson(kvGet(db, "settings"), {}) }
    state.selectedCourseId = parseJson(kvGet(db, "selectedCourseId"), null)
    state.selectedVideoId = parseJson(kvGet(db, "selectedVideoId"), null)
    state.activity = parseJson(kvGet(db, "activity"), "summary")
    state.gatePassed = parseJson(kvGet(db, "gatePassed"), false)
    state.searchHits = parseJson(kvGet(db, "searchHits"), [])
    state.activeConversationByCourse = parseJson(kvGet(db, "activeConversationByCourse"), {})
    state.lastAskError = parseJson(kvGet(db, "lastAskError"), null)
    const fallback: LegacyCourseGlobals = {
      appLanguage: state.appLanguage,
      outputLanguage: parseJson(kvGet(db, "outputLanguage"), null),
      spokenLanguageDefault: parseJson(kvGet(db, "spokenLanguageDefault"), null),
      prompts: parseJson<Partial<CoursePrompts> | null>(kvGet(db, "prompts"), null)
    }
    const legacyKeysPresent =
      kvGet(db, "outputLanguage") !== null ||
      kvGet(db, "spokenLanguageDefault") !== null ||
      kvGet(db, "prompts") !== null
    const courses = db.prepare(
      "SELECT id, name, position, spoken_language, output_language, prompts FROM courses ORDER BY position"
    ).all() as {
      id: string
      name: string
      position: number
      spoken_language: string | null
      output_language: string | null
      prompts: string | null
    }[]
    state.courses = courses.map((course) => {
      if (course.spoken_language === null || course.output_language === null || course.prompts === null) {
        needsPersist = true
      }
      return hydrateCourse(
        {
          id: course.id,
          name: course.name,
          spokenLanguageDefault: course.spoken_language,
          outputLanguage: course.output_language,
          prompts: parseJson(course.prompts, null)
        },
        fallback
      )
    })
    if (legacyKeysPresent) needsPersist = true
  })
  for (const course of state.courses) loadCourseFile(dataDir, course.id, state)
  if (state.selectedCourseId) {
    state.embeddings = loadCourseEmbeddings(dataDir, state.selectedCourseId)
  }
  for (const video of state.videos) {
    video.hasSummary = Boolean(state.summaries[video.id])
  }
  if (needsPersist) saveLibrary(dataDir, state)
  return state
}

type LegacyJson = Partial<LibraryState> & {
  outputLanguage?: LegacyCourseGlobals["outputLanguage"]
  spokenLanguageDefault?: LegacyCourseGlobals["spokenLanguageDefault"]
  prompts?: Partial<CoursePrompts>
}

function loadJsonFile(dataDir: string): LibraryState | null {
  try {
    const loaded = JSON.parse(readFileSync(jsonPath(dataDir), "utf8")) as LegacyJson
    const {
      outputLanguage,
      spokenLanguageDefault,
      prompts,
      courses,
      settings,
      ...rest
    } = loaded
    return {
      ...emptyLibraryState(),
      ...rest,
      settings: { ...DEFAULT_SETTINGS, ...settings },
      courses: (courses ?? []).map((course) =>
        hydrateCourse(course, {
          appLanguage: rest.appLanguage,
          outputLanguage,
          spokenLanguageDefault,
          prompts
        })
      )
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
