import { describe, expect, test } from "vitest"
import type { Hit } from "../../src/library/types.js"
import { linkHitCitations, resolveHit } from "../../src/library/hitLinks.js"

const videoId = "vid_37c35567-e89b-12d3-a456-426614174000"

function captionHit(startSeconds: number, id = videoId): Hit {
  return {
    videoId: id,
    sessionId: "ses_1",
    startSeconds,
    text: "snippet",
    kind: "caption",
    score: 1,
    origin: "video"
  }
}

describe("Ask timestamp links", () => {
  test("a truncated Hit citation uses the real Video id from Hits", () => {
    const hits = [captionHit(7.4)]
    const target = resolveHit("#hit/vid_37c35567.../7.4", "0:07", hits)
    expect(target).toEqual({ videoId, seconds: 7.4 })
  })

  test("a timestamp label jumps to the Hit at that time", () => {
    const hits = [captionHit(19.2), captionHit(7.4)]
    expect(resolveHit("#", "0:19", hits)).toEqual({ videoId, seconds: 19.2 })
  })

  test("an unknown Video id is not returned when Hits are present", () => {
    const hits = [captionHit(7.4)]
    expect(resolveHit("#hit/vid_missing/99", "1:39", hits)).toBeNull()
  })

  test("rewritten citations point at the real Video id", () => {
    const hits = [captionHit(217.68)]
    const linked = linkHitCitations("[Hit: vid_37c35567... @ 217.68s]", hits)
    expect(linked).toBe(`[3:37](#hit/${encodeURIComponent(videoId)}/217.68)`)
  })
})
