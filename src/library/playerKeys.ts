export type PlayerKeyAction =
  | "playPause"
  | "speedUp"
  | "speedDown"
  | "seekForward"
  | "seekBack"
  | "toggleCaptions"
  | "toggleFullscreen"
  | "toggleMute"
  | "volumeUp"
  | "volumeDown"
  | "nextVideo"
  | "previousVideo"

export type PlayerKeyInput = {
  key: string
  code: string
  meta: boolean
  control: boolean
  alt: boolean
  shift: boolean
  repeat?: boolean
}

export type PlayerKeyTarget = {
  tagName: string
  type?: string
  isContentEditable?: boolean
  role?: string | null
}

const FIELD_TAGS = new Set(["input", "textarea", "select"])
const CONTROL_TAGS = new Set(["button", "option", "summary", "dialog", "a"])
const FIELD_ROLES = new Set(["textbox", "searchbox", "combobox", "slider", "spinbutton"])
const CONTROL_ROLES = new Set([
  "button",
  "checkbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "switch",
  "tab",
  "link",
  "dialog",
  "alertdialog"
])

export function playerShortcutFromInput(input: PlayerKeyInput): PlayerKeyAction | null {
  if (input.meta || input.control || input.alt) return null
  const key = input.key.length === 1 ? input.key.toLowerCase() : input.key
  const letter = (code: string, letterKey: string): boolean =>
    input.code === code || key === letterKey

  if (input.code === "Space" || key === " " || letter("KeyK", "k")) {
    return input.repeat ? null : "playPause"
  }
  if (key === ">" || (input.code === "Period" && input.shift)) {
    return input.repeat ? null : "speedUp"
  }
  if (key === "<" || (input.code === "Comma" && input.shift)) {
    return input.repeat ? null : "speedDown"
  }
  if (letter("KeyL", "l") || input.code === "ArrowRight" || key === "ArrowRight") {
    return "seekForward"
  }
  if (letter("KeyJ", "j") || input.code === "ArrowLeft" || key === "ArrowLeft") {
    return "seekBack"
  }
  if (input.code === "ArrowUp" || key === "ArrowUp") return "volumeUp"
  if (input.code === "ArrowDown" || key === "ArrowDown") return "volumeDown"
  if (letter("KeyC", "c")) return input.repeat ? null : "toggleCaptions"
  if (
    letter("KeyF", "f") ||
    input.code === "Enter" ||
    input.code === "NumpadEnter" ||
    key === "Enter"
  ) {
    return input.repeat ? null : "toggleFullscreen"
  }
  if (letter("KeyM", "m")) return input.repeat ? null : "toggleMute"
  if (input.key === "N" || (input.shift && letter("KeyN", "n"))) {
    return input.repeat ? null : "nextVideo"
  }
  if (input.key === "P" || (input.shift && letter("KeyP", "p"))) {
    return input.repeat ? null : "previousVideo"
  }
  return null
}

export function playerShortcutBlocked(
  target: PlayerKeyTarget | null,
  scope: "player" | "app" = "app"
): boolean {
  if (!target) return false
  if (target.isContentEditable) return true
  const tag = target.tagName.toLowerCase()
  if (FIELD_TAGS.has(tag)) return true
  const role = target.role?.toLowerCase()
  if (role && FIELD_ROLES.has(role)) return true
  if (scope === "player") return false
  if (CONTROL_TAGS.has(tag)) return true
  return Boolean(role && CONTROL_ROLES.has(role))
}

export function steppedSpeed(current: number, delta: 1 | -1, speeds: readonly number[]): number {
  const index = speeds.findIndex((speed) => speed === current)
  if (index < 0) {
    const nearest = speeds.reduce(
      (best, speed, i) =>
        Math.abs(speed - current) < Math.abs(speeds[best]! - current) ? i : best,
      0
    )
    return speeds[Math.min(speeds.length - 1, Math.max(0, nearest + delta))] ?? current
  }
  return speeds[Math.min(speeds.length - 1, Math.max(0, index + delta))] ?? current
}

export function steppedVolume(current: number, delta: 1 | -1, step = 0.05): number {
  const next = Math.round(current / step + delta) * step
  return Math.min(1, Math.max(0, next))
}
