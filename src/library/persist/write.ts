import { DatabaseSync } from "node:sqlite"
import { ensureApp, ensureCourse, kvDelete, kvSet, withDb } from "./db.js"
import { saveVideoEmbeddings } from "./embeddings.js"
import { appPath, coursePath } from "./paths.js"
import type { LibraryState } from "./types.js"

export function writeConversationRows(db: DatabaseSync, state: LibraryState, courseId: string): void {
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

export function writeCourse(dataDir: string, courseId: string, state: LibraryState): void {
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

export function writeEmbeddingsForState(dataDir: string, state: LibraryState): void {
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

export function writeApp(dataDir: string, state: LibraryState): void {
  withDb(appPath(dataDir), (db) => {
    ensureApp(db)
    db.exec("DELETE FROM courses")
    const insert = db.prepare(
      "INSERT INTO courses(id, name, position, spoken_language, output_language, prompts) VALUES(?, ?, ?, ?, ?, ?)"
    )
    state.courses.forEach((course, position) =>
      insert.run(
        course.id,
        course.name,
        position,
        course.spokenLanguageDefault,
        course.outputLanguage,
        JSON.stringify(course.prompts)
      )
    )
    kvSet(db, "appLanguage", JSON.stringify(state.appLanguage))
    kvSet(db, "provider", JSON.stringify(state.provider))
    kvSet(db, "providerVault", JSON.stringify(state.providerVault))
    kvSet(db, "settings", JSON.stringify(state.settings))
    kvSet(db, "selectedCourseId", JSON.stringify(state.selectedCourseId))
    kvSet(db, "selectedVideoId", JSON.stringify(state.selectedVideoId))
    kvSet(db, "activity", JSON.stringify(state.activity))
    kvSet(db, "gatePassed", JSON.stringify(state.gatePassed))
    kvSet(db, "searchHits", JSON.stringify(state.searchHits))
    kvSet(db, "activeConversationByCourse", JSON.stringify(state.activeConversationByCourse))
    kvSet(db, "lastAskError", JSON.stringify(state.lastAskError))
    kvDelete(db, "outputLanguage")
    kvDelete(db, "spokenLanguageDefault")
    kvDelete(db, "prompts")
  })
}
