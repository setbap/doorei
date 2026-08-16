import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"

export function withDb<T>(path: string, fn: (db: DatabaseSync) => T): T {
  mkdirSync(join(path, ".."), { recursive: true })
  const db = new DatabaseSync(path)
  try {
    db.exec("PRAGMA journal_mode = WAL")
    return fn(db)
  } finally {
    db.close()
  }
}

export function ensureApp(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      position INTEGER NOT NULL
    );
  `)
}

export function ensureCourse(db: DatabaseSync): void {
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

export function kvGet(db: DatabaseSync, key: string): string | null {
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function kvSet(db: DatabaseSync, key: string, value: string): void {
  db.prepare("INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    key,
    value
  )
}

export function parseJson<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function vectorToBlob(vector: number[]): Uint8Array {
  return new Uint8Array(new Float32Array(vector).buffer)
}

export function blobToVector(blob: Uint8Array): number[] {
  const copy = blob.byteOffset % 4 === 0 ? blob : new Uint8Array(blob)
  return Array.from(new Float32Array(copy.buffer, copy.byteOffset, Math.floor(copy.byteLength / 4)))
}
