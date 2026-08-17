import { describe, expect, test } from "vitest"
import { chromeKeyAction, shouldBlockChromeKey } from "../../src/main/chromeKeys.js"

const base = {
  type: "keyDown",
  key: "",
  code: "",
  meta: false,
  control: false,
  alt: false,
  shift: false
}

describe("chromeKeyAction", () => {
  test("Ctrl/Cmd + and - zoom, 0 resets", () => {
    expect(
      chromeKeyAction({ ...base, key: "=", code: "Equal", meta: true })
    ).toBe("zoomIn")
    expect(
      chromeKeyAction({ ...base, key: "+", code: "Equal", control: true, shift: true })
    ).toBe("zoomIn")
    expect(
      chromeKeyAction({ ...base, key: "-", code: "Minus", control: true })
    ).toBe("zoomOut")
    expect(
      chromeKeyAction({ ...base, key: "0", code: "Digit0", meta: true })
    ).toBe("resetZoom")
  })

  test("F12 and inspector chords are DevTools", () => {
    expect(chromeKeyAction({ ...base, key: "F12", code: "F12" })).toBe("devtools")
    expect(
      chromeKeyAction({ ...base, key: "i", code: "KeyI", control: true, shift: true })
    ).toBe("devtools")
    expect(
      chromeKeyAction({ ...base, key: "i", code: "KeyI", meta: true, alt: true })
    ).toBe("devtools")
  })

  test("Cmd+J without shift is not DevTools", () => {
    expect(
      chromeKeyAction({ ...base, key: "j", code: "KeyJ", meta: true })
    ).toBe(null)
  })

  test("find, save, view source, and new window are blocked browser chords", () => {
    expect(chromeKeyAction({ ...base, key: "f", code: "KeyF", control: true })).toBe("find")
    expect(chromeKeyAction({ ...base, key: "g", code: "KeyG", meta: true })).toBe("find")
    expect(chromeKeyAction({ ...base, key: "s", code: "KeyS", meta: true })).toBe("save")
    expect(chromeKeyAction({ ...base, key: "u", code: "KeyU", control: true })).toBe("viewSource")
    expect(chromeKeyAction({ ...base, key: "n", code: "KeyN", meta: true })).toBe("newWindow")
  })

  test("Cmd+E is not a Chromium chord, so Toggle Tools can use it", () => {
    expect(chromeKeyAction({ ...base, key: "e", code: "KeyE", meta: true })).toBe(null)
    expect(chromeKeyAction({ ...base, key: "e", code: "KeyE", control: true })).toBe(null)
  })

  test("Alt arrows are history navigation", () => {
    expect(
      chromeKeyAction({ ...base, key: "ArrowLeft", code: "ArrowLeft", alt: true })
    ).toBe("historyBack")
  })
})

describe("shouldBlockChromeKey", () => {
  test("zoom is always blocked", () => {
    expect(shouldBlockChromeKey("zoomIn", false)).toBe(true)
    expect(shouldBlockChromeKey("zoomOut", true)).toBe(true)
  })

  test("DevTools stays available while unpackaged", () => {
    expect(shouldBlockChromeKey("devtools", false)).toBe(false)
    expect(shouldBlockChromeKey("devtools", true)).toBe(true)
  })
})
