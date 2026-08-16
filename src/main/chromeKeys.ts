import type { ShortcutInput } from "./shortcuts.js"

export type ChromeKeyAction =
  | "zoomIn"
  | "zoomOut"
  | "resetZoom"
  | "devtools"
  | "find"
  | "save"
  | "viewSource"
  | "newWindow"
  | "historyBack"
  | "historyForward"

function isMod(input: ShortcutInput): boolean {
  return input.meta || input.control
}

function key(input: ShortcutInput): string {
  return input.key.length === 1 ? input.key.toLowerCase() : input.key
}

export function chromeKeyAction(input: ShortcutInput): ChromeKeyAction | null {
  if (input.type && input.type !== "keyDown") return null
  if (input.isComposing) return null

  if (input.code === "F12" || input.key === "F12") return "devtools"

  if (input.alt && (input.code === "ArrowLeft" || input.key === "ArrowLeft")) {
    return "historyBack"
  }
  if (input.alt && (input.code === "ArrowRight" || input.key === "ArrowRight")) {
    return "historyForward"
  }

  if (!isMod(input)) return null

  if (input.alt && (input.code === "KeyI" || key(input) === "i")) return "devtools"
  if (input.shift && (input.code === "KeyI" || key(input) === "i")) return "devtools"
  if (input.shift && (input.code === "KeyJ" || key(input) === "j")) return "devtools"
  if (input.shift && (input.code === "KeyC" || key(input) === "c")) return "devtools"

  if (input.code === "Equal" || input.code === "NumpadAdd" || input.key === "+" || input.key === "=") {
    return "zoomIn"
  }
  if (input.code === "Minus" || input.code === "NumpadSubtract" || input.key === "-" || input.key === "_") {
    return "zoomOut"
  }
  if (input.code === "Digit0" || input.code === "Numpad0" || input.key === "0") {
    return "resetZoom"
  }

  if (input.alt || input.shift) return null

  if (input.code === "KeyF" || key(input) === "f") return "find"
  if (input.code === "KeyG" || key(input) === "g") return "find"
  if (input.code === "KeyS" || key(input) === "s") return "save"
  if (input.code === "KeyU" || key(input) === "u") return "viewSource"
  if (input.code === "KeyN" || key(input) === "n") return "newWindow"
  if (input.key === "[" || input.code === "BracketLeft") return "historyBack"
  if (input.key === "]" || input.code === "BracketRight") return "historyForward"

  return null
}

export function shouldBlockChromeKey(
  action: ChromeKeyAction,
  isPackaged: boolean
): boolean {
  if (action === "devtools") return isPackaged
  return true
}
