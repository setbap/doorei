import type { Caption, CaptionSegment } from "./types.js"

function parseClock(value: string): number {
  const normalized = value.trim().replace(",", ".")
  const parts = normalized.split(":")
  if (parts.length < 3) return 0
  const hours = Number(parts[0])
  const minutes = Number(parts[1])
  const seconds = Number(parts[2])
  return hours * 3600 + minutes * 60 + seconds
}

export function parseCaptionFile(text: string): CaptionSegment[] {
  const body = text.replace(/^\uFEFF/, "").replace(/^WEBVTT[^\n]*\n/i, "")
  const blocks = body.split(/\n\s*\n/)
  const segments: CaptionSegment[] = []
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter((line) => line.trim().length > 0)
    const timeLine = lines.find((line) => line.includes("-->"))
    if (!timeLine) continue
    const [startRaw, endRaw] = timeLine.split("-->")
    const textLines = lines.filter((line) => line !== timeLine && !/^\d+$/.test(line.trim()))
    const captionText = textLines.join(" ").trim()
    if (!captionText || !startRaw || !endRaw) continue
    segments.push({
      startSeconds: parseClock(startRaw),
      endSeconds: parseClock(endRaw.split(" ")[0] ?? endRaw),
      text: captionText
    })
  }
  return segments
}

export function captionFromSidecar(text: string): Caption {
  return { source: "imported", segments: parseCaptionFile(text) }
}
