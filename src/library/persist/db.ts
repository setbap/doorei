import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"

const open = new Map<string, DatabaseSync>()

function openDb(path: string): DatabaseSync {
  const existing = open.get(path)
  if (existing) return existing
  mkdirSync(join(path, ".."), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA synchronous = NORMAL")
  db.exec("PRAGMA temp_store = MEMORY")
  db.exec("PRAGMA busy_timeout = 5000")
  open.set(path, db)
  return db
}

export function withDb<T>(path: string, fn: (db: DatabaseSync) => T): T {
  return fn(openDb(path))
}

export function closeDb(path: string): void {
  const db = open.get(path)
  if (!db) return
  db.close()
  open.delete(path)
}

export function closeAllDbs(): void {
  for (const [path, db] of open) {
    db.close()
    open.delete(path)
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
  addColumn(db, "courses", "spoken_language", "TEXT")
  addColumn(db, "courses", "output_language", "TEXT")
  addColumn(db, "courses", "prompts", "TEXT")
}

function addColumn(db: DatabaseSync, table: string, column: string, spec: string): void {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${spec}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes("duplicate column name")) throw error
  }
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

export function kvDelete(db: DatabaseSync, key: string): void {
  db.prepare("DELETE FROM kv WHERE key = ?").run(key)
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
