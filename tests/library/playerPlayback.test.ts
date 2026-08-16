import { describe, expect, test } from "vitest"
import { playAfterMediaReady, resumeSeconds } from "../../src/library/playerPlayback.js"

describe("player playback after a Video ends or the next Video is chosen", () => {
  test("Playback Position at the end of the file resumes from the start, not the last second", () => {
    expect(resumeSeconds(0, 120)).toBe(0)
    expect(resumeSeconds(40, 120)).toBe(40)
    expect(resumeSeconds(120, 120)).toBe(0)
    expect(resumeSeconds(119.6, 120)).toBe(0)
  })

  test("play starts only after the media URL belongs to the selected Video", () => {
    expect(playAfterMediaReady({ selectedId: "b", mediaId: "a", playAfterId: "b" })).toBe(false)
    expect(playAfterMediaReady({ selectedId: "b", mediaId: "b", playAfterId: "b" })).toBe(true)
    expect(playAfterMediaReady({ selectedId: "b", mediaId: "b", playAfterId: null })).toBe(false)
  })
})
