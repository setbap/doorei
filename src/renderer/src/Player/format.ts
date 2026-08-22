import type { CaptionSegment } from "../../../library/types.js"
import { activeCaption as lookupCaption } from "../../../library/captionLookup.js"

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`
}

export function formatSpeed(speed: number): string {
  return `${speed}×`
}

export function toHex6(color: string): string {
  const hex = color.startsWith("#") ? color.slice(0, 7) : "#ffffff"
  return hex.length === 7 ? hex : "#ffffff"
}

export function activeCaption(segments: CaptionSegment[], time: number): string {
  return lookupCaption(segments, time)
}
