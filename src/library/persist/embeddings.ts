import { existsSync } from "node:fs"
import { blobToVector, ensureCourse, vectorToBlob, withDb } from "./db.js"
import { coursePath } from "./paths.js"
import type { EmbeddingRow } from "./types.js"

export function loadCourseEmbeddings(
  dataDir: string,
  courseId: string
): Record<string, EmbeddingRow[]> {
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
