import { describe, expect, test } from "vitest"
import {
  playerShortcutBlocked,
  playerShortcutFromInput,
  steppedSpeed,
  steppedVolume
} from "../../src/library/playerKeys.js"

const base = {
  key: "",
  code: "",
  meta: false,
  control: false,
  alt: false,
  shift: false,
  repeat: false
}

describe("playerShortcutFromInput", () => {
  test("Space plays or pauses", () => {
    expect(playerShortcutFromInput({ ...base, key: " ", code: "Space" })).toBe("playPause")
    expect(playerShortcutFromInput({ ...base, key: " ", code: "Space", repeat: true })).toBe(null)
  })

  test("> and Shift+Period increase speed; < and Shift+Comma decrease speed", () => {
    expect(playerShortcutFromInput({ ...base, key: ">", code: "Period", shift: true })).toBe("speedUp")
    expect(playerShortcutFromInput({ ...base, key: ".", code: "Period", shift: true })).toBe("speedUp")
    expect(playerShortcutFromInput({ ...base, key: "<", code: "Comma", shift: true })).toBe("speedDown")
    expect(playerShortcutFromInput({ ...base, key: ",", code: "Comma", shift: true })).toBe("speedDown")
    expect(playerShortcutFromInput({ ...base, key: ".", code: "Period" })).toBe(null)
    expect(playerShortcutFromInput({ ...base, key: ",", code: "Comma" })).toBe(null)
  })

  test("l or ArrowRight skip forward; j or ArrowLeft skip back, including on a Persian layout", () => {
    expect(playerShortcutFromInput({ ...base, key: "l", code: "KeyL" })).toBe("seekForward")
    expect(playerShortcutFromInput({ ...base, key: "م", code: "KeyL" })).toBe("seekForward")
    expect(playerShortcutFromInput({ ...base, key: "ArrowRight", code: "ArrowRight" })).toBe(
      "seekForward"
    )
    expect(playerShortcutFromInput({ ...base, key: "j", code: "KeyJ" })).toBe("seekBack")
    expect(playerShortcutFromInput({ ...base, key: "ت", code: "KeyJ" })).toBe("seekBack")
    expect(playerShortcutFromInput({ ...base, key: "ArrowLeft", code: "ArrowLeft" })).toBe("seekBack")
  })

  test("ArrowUp raises volume; ArrowDown lowers volume", () => {
    expect(playerShortcutFromInput({ ...base, key: "ArrowUp", code: "ArrowUp" })).toBe("volumeUp")
    expect(playerShortcutFromInput({ ...base, key: "ArrowDown", code: "ArrowDown" })).toBe(
      "volumeDown"
    )
  })

  test("c shows or hides Captions", () => {
    expect(playerShortcutFromInput({ ...base, key: "c", code: "KeyC" })).toBe("toggleCaptions")
    expect(playerShortcutFromInput({ ...base, key: "ز", code: "KeyC" })).toBe("toggleCaptions")
  })

  test("modifier chords are left to app shortcuts", () => {
    expect(playerShortcutFromInput({ ...base, key: "j", code: "KeyJ", meta: true })).toBe(null)
    expect(playerShortcutFromInput({ ...base, key: "j", code: "KeyJ", control: true })).toBe(null)
    expect(playerShortcutFromInput({ ...base, key: "ArrowLeft", code: "ArrowLeft", alt: true })).toBe(
      null
    )
  })
})

describe("playerShortcutBlocked", () => {
  test("buttons, fields, and similar controls keep their own keys outside the player", () => {
    expect(playerShortcutBlocked({ tagName: "BUTTON" })).toBe(true)
    expect(playerShortcutBlocked({ tagName: "INPUT", type: "text" })).toBe(true)
    expect(playerShortcutBlocked({ tagName: "INPUT", type: "checkbox" })).toBe(true)
    expect(playerShortcutBlocked({ tagName: "TEXTAREA" })).toBe(true)
    expect(playerShortcutBlocked({ tagName: "SELECT" })).toBe(true)
    expect(playerShortcutBlocked({ tagName: "DIV", role: "button" })).toBe(true)
    expect(playerShortcutBlocked({ tagName: "DIV", role: "checkbox" })).toBe(true)
    expect(playerShortcutBlocked({ tagName: "P", isContentEditable: true })).toBe(true)
    expect(playerShortcutBlocked({ tagName: "DIV", role: "dialog" })).toBe(true)
  })

  test("player buttons still receive shortcuts; fields inside the player do not", () => {
    expect(playerShortcutBlocked({ tagName: "BUTTON" }, "player")).toBe(false)
    expect(playerShortcutBlocked({ tagName: "INPUT", type: "range" }, "player")).toBe(true)
    expect(playerShortcutBlocked({ tagName: "VIDEO" }, "player")).toBe(false)
  })

  test("the player surface itself is not blocked", () => {
    expect(playerShortcutBlocked({ tagName: "VIDEO" })).toBe(false)
    expect(playerShortcutBlocked({ tagName: "DIV" })).toBe(false)
    expect(playerShortcutBlocked({ tagName: "BODY" })).toBe(false)
    expect(playerShortcutBlocked(null)).toBe(false)
  })
})

describe("steppedSpeed", () => {
  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

  test("steps through the speed list and stays at the ends", () => {
    expect(steppedSpeed(1, 1, speeds)).toBe(1.25)
    expect(steppedSpeed(1, -1, speeds)).toBe(0.75)
    expect(steppedSpeed(2, 1, speeds)).toBe(2)
    expect(steppedSpeed(0.5, -1, speeds)).toBe(0.5)
  })
})

describe("steppedVolume", () => {
  test("steps by five percent and stays between 0 and 1", () => {
    expect(steppedVolume(0.5, 1)).toBe(0.55)
    expect(steppedVolume(0.5, -1)).toBe(0.45)
    expect(steppedVolume(1, 1)).toBe(1)
    expect(steppedVolume(0, -1)).toBe(0)
  })
})
