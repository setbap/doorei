import { describe, expect, test } from "vitest"
import { shortcutFromInput } from "../../src/main/shortcuts.js"

const comma = {
  type: "keyDown",
  key: ",",
  code: "Comma",
  meta: false,
  control: false,
  alt: false,
  shift: false
}

describe("shortcutFromInput", () => {
  test("Cmd+, and Ctrl+, open Settings", () => {
    expect(shortcutFromInput({ ...comma, meta: true })).toBe("openSettings")
    expect(shortcutFromInput({ ...comma, control: true })).toBe("openSettings")
    expect(shortcutFromInput(comma)).toBe(null)
    expect(shortcutFromInput({ ...comma, meta: true, shift: true })).toBe(null)
  })

  test("Cmd+P and Ctrl+P toggle the action panel", () => {
    const p = { ...comma, key: "p", code: "KeyP" }
    expect(shortcutFromInput({ ...p, meta: true })).toBe("toggleActionPanel")
    expect(shortcutFromInput({ ...p, control: true })).toBe("toggleActionPanel")
    expect(shortcutFromInput(p)).toBe(null)
  })

  test("Cmd+B and Ctrl+B toggle the Library", () => {
    const b = { ...comma, key: "b", code: "KeyB" }
    expect(shortcutFromInput({ ...b, meta: true })).toBe("toggleLibrary")
    expect(shortcutFromInput({ ...b, control: true })).toBe("toggleLibrary")
    expect(shortcutFromInput(b)).toBe(null)
  })

  test("Cmd+E and Ctrl+E toggle the tool pane", () => {
    const e = { ...comma, key: "e", code: "KeyE" }
    expect(shortcutFromInput({ ...e, meta: true })).toBe("toggleToolPane")
    expect(shortcutFromInput({ ...e, control: true })).toBe("toggleToolPane")
    expect(shortcutFromInput(e)).toBe(null)
  })

  test("Cmd+` and Ctrl+` toggle the note", () => {
    const tick = { ...comma, key: "`", code: "Backquote" }
    expect(shortcutFromInput({ ...tick, meta: true })).toBe("toggleNote")
    expect(shortcutFromInput({ ...tick, control: true })).toBe("toggleNote")
    expect(shortcutFromInput(tick)).toBe(null)
  })
})
