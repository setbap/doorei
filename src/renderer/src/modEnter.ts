import type { KeyboardEvent } from "react"

export function isModEnter(event: KeyboardEvent<HTMLElement>): boolean {
  return event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey
}

export function sendChord(): string {
  return window.doorei.platform === "darwin" ? "⌘↵" : "Ctrl+Enter"
}
