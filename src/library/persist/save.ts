import { existsSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { ensureCourse, withDb } from "./db.js"
import { saveVideoEmbeddings } from "./embeddings.js"
import { courseIdForVideo, coursePath } from "./paths.js"
import type { LibraryState, PersistHint } from "./types.js"
import { writeApp, writeConversationRows, writeCourse } from "./write.js"

export function persistLibrary(dataDir: string, state: LibraryState, hint: PersistHint): void {
  mkdirSync(dataDir, { recursive: true })
  if (hint.kind === "library") {
    saveLibrary(dataDir, state)
    return
  }
  if (hint.kind === "app") {
    writeApp(dataDir, state)
    return
  }
  if (hint.kind === "course") {
    writeApp(dataDir, state)
    writeCourse(dataDir, hint.courseId, state)
    return
  }
  if (hint.kind === "playback") {
    savePlayback(dataDir, state, hint.videoId)
    return
  }
  if (hint.kind === "ask") {
    saveConversations(dataDir, state, hint.courseId)
    return
  }
  if (hint.kind === "captioning") {
    saveCaptioning(dataDir, state, hint.videoId)
    return
  }
  saveVideoEmbeddings(dataDir, hint.courseId, hint.videoId, state.embeddings[hint.videoId] ?? [])
}

export function saveLibrary(dataDir: string, state: LibraryState): void {
  mkdirSync(dataDir, { recursive: true })
  writeApp(dataDir, state)
  for (const course of state.courses) writeCourse(dataDir, course.id, state)
}

function saveCaptioning(dataDir: string, state: LibraryState, videoId: string): void {
  const courseId = courseIdForVideo(state, videoId)
  const video = state.videos.find((item) => item.id === videoId)
  const path = courseId ? coursePath(dataDir, courseId) : null
  if (!courseId || !video || !path || !existsSync(path)) {
    saveLibrary(dataDir, state)
    return
  }
  withDb(path, (db) => {
    ensureCourse(db)
    db.prepare("UPDATE videos SET captioning_progress = ? WHERE id = ?").run(
      video.captioningProgress,
      videoId
    )
    db.prepare("DELETE FROM captions WHERE video_id = ?").run(videoId)
    const caption = state.captions[videoId]
    if (caption) {
      db.prepare("INSERT INTO captions(video_id, source, segments) VALUES(?, ?, ?)").run(
        videoId,
        caption.source,
        JSON.stringify(caption.segments)
      )
    }
    db.prepare("DELETE FROM jobs WHERE video_id = ?").run(videoId)
    const insertJob = db.prepare(
      "INSERT INTO jobs(id, kind, video_id, status, progress, error) VALUES(?, ?, ?, ?, ?, ?)"
    )
    for (const job of state.jobs.filter((item) => item.videoId === videoId)) {
      insertJob.run(job.id, job.kind, job.videoId, job.status, job.progress, job.error)
    }
  })
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
