export type ShortcutId =
  | "openSettings"
  | "toggleActionPanel"
  | "toggleLibrary"
  | "toggleToolPane"
  | "toggleNote"

export type ShortcutInput = {
  type?: string
  key: string
  code: string
  meta: boolean
  control: boolean
  alt: boolean
  shift: boolean
  isAutoRepeat?: boolean
  isComposing?: boolean
}

export function shortcutFromInput(input: ShortcutInput): ShortcutId | null {
  if (input.type && input.type !== "keyDown") return null
  if (input.isAutoRepeat || input.isComposing) return null
  if (input.alt || input.shift) return null
  if (!input.meta && !input.control) return null
  if (input.code === "Comma" || input.key === ",") return "openSettings"
  if (input.code === "KeyP" || input.key.toLowerCase() === "p") return "toggleActionPanel"
  if (input.code === "KeyB" || input.key.toLowerCase() === "b") return "toggleLibrary"
  if (input.code === "KeyJ" || input.key.toLowerCase() === "j") return "toggleToolPane"
  if (input.code === "Backquote" || input.key === "`") return "toggleNote"
  return null
}
