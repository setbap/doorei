import type { CaptionSegment } from "./types.js"

export function activeCaptionIndex(segments: CaptionSegment[], time: number): number {
  let lo = 0
  let hi = segments.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const segment = segments[mid]
    if (!segment) return -1
    if (time < segment.startSeconds) hi = mid - 1
    else if (time > segment.endSeconds) lo = mid + 1
    else return mid
  }
  return -1
}

export function activeCaption(segments: CaptionSegment[], time: number): string {
  const index = activeCaptionIndex(segments, time)
  return index >= 0 ? (segments[index]?.text ?? "") : ""
}
