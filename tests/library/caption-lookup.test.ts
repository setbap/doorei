import { describe, expect, test } from "vitest"
import { activeCaption, activeCaptionIndex } from "../../src/library/captionLookup.js"
import type { CaptionSegment } from "../../src/library/types.js"

const SEGMENTS: CaptionSegment[] = [
  { startSeconds: 0, endSeconds: 2, text: "one" },
  { startSeconds: 2.5, endSeconds: 4, text: "two" },
  { startSeconds: 10, endSeconds: 12, text: "three" }
]

describe("caption lookup", () => {
  test("finds the active Caption by binary search", () => {
    expect(activeCaptionIndex(SEGMENTS, 0)).toBe(0)
    expect(activeCaptionIndex(SEGMENTS, 1.9)).toBe(0)
    expect(activeCaptionIndex(SEGMENTS, 3)).toBe(1)
    expect(activeCaptionIndex(SEGMENTS, 11)).toBe(2)
    expect(activeCaption(SEGMENTS, 11)).toBe("three")
  })

  test("returns no Caption in gaps or outside the range", () => {
    expect(activeCaptionIndex(SEGMENTS, 2.2)).toBe(-1)
    expect(activeCaptionIndex(SEGMENTS, 5)).toBe(-1)
    expect(activeCaptionIndex(SEGMENTS, -1)).toBe(-1)
    expect(activeCaptionIndex([], 1)).toBe(-1)
    expect(activeCaption(SEGMENTS, 5)).toBe("")
  })
})
