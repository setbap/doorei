import { jsonrepair } from "jsonrepair"
import { formatStamp } from "../hitLinks.js"
import type { CaptionSegment } from "../types.js"

const IMPROVE_CHUNK_SEGMENTS = 80
const IMPROVE_CHUNK_CHARS = 12_000

export function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

export function basename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path
}

export function titleFromQuestion(question: string): string {
  const trimmed = question.trim().replace(/\s+/g, " ")
  return trimmed.length <= 80 ? trimmed : trimmed.slice(0, 80)
}

export function unwrapFence(text: string): string {
  const trimmed = text.trim()
  const fenced = /^```(?:json|markdown|md)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed)
  return (fenced ? fenced[1] : trimmed).trim()
}

function asJsonArray(parsed: unknown): unknown[] {
  if (!Array.isArray(parsed)) {
    throw new Error("Provider returned invalid Improved Caption")
  }
  return parsed
}

export function parseJsonArray(raw: string): unknown[] {
  const unwrapped = unwrapFence(raw)
  const start = unwrapped.indexOf("[")
  const end = unwrapped.lastIndexOf("]")
  const candidates = [unwrapped]
  if (start >= 0 && end > start) {
    candidates.push(unwrapped.slice(start, end + 1))
  }
  let lastError: unknown
  for (const candidate of candidates) {
    try {
      return asJsonArray(JSON.parse(candidate))
    } catch (error) {
      lastError = error
    }
    try {
      return asJsonArray(JSON.parse(jsonrepair(candidate)))
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Provider returned invalid Improved Caption")
}

export function parseImprovedTexts(raw: string, originals: string[]): string[] {
  const parsed = parseJsonArray(raw)
  return originals.map((original, index) => {
    const item = parsed[index]
    if (typeof item === "string") return item
    if (item && typeof item === "object" && "text" in item) {
      const text = (item as { text: unknown }).text
      if (typeof text === "string") return text
    }
    return original
  })
}

export function chunkCaption(segments: CaptionSegment[]): CaptionSegment[][] {
  const chunks: CaptionSegment[][] = []
  let current: CaptionSegment[] = []
  let chars = 0
  for (const segment of segments) {
    const extra = segment.text.length + 4
    if (
      current.length > 0 &&
      (current.length >= IMPROVE_CHUNK_SEGMENTS || chars + extra > IMPROVE_CHUNK_CHARS)
    ) {
      chunks.push(current)
      current = []
      chars = 0
    }
    current.push(segment)
    chars += extra
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

export function captionLines(segments: CaptionSegment[]): string {
  return segments.map((segment) => `[${formatStamp(segment.startSeconds)}] ${segment.text}`).join("\n")
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i += 1) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    dot += x * y
    na += x * x
    nb += y * y
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}
