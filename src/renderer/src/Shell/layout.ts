const SHELL_LAYOUT_KEY = "doorei.shell-layout"
const COMPOSER_OPEN_KEY = "doorei.composer-open"
const DEFAULT_SHELL_LAYOUT = { library: 22, player: 53, tools: 25 }

export function loadComposerOpen(): boolean {
  try {
    return localStorage.getItem(COMPOSER_OPEN_KEY) !== "0"
  } catch {
    return true
  }
}

export function saveComposerOpen(open: boolean): void {
  try {
    localStorage.setItem(COMPOSER_OPEN_KEY, open ? "1" : "0")
  } catch {
    /* quota or private mode */
  }
}

export function loadShellLayout(): { library: number; player: number; tools: number } {
  try {
    const raw = localStorage.getItem(SHELL_LAYOUT_KEY)
    if (!raw) return DEFAULT_SHELL_LAYOUT
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return DEFAULT_SHELL_LAYOUT
    const record = parsed as Record<string, unknown>
    const library = record.library
    const player = record.player
    const tools = record.tools
    if (
      typeof library !== "number" ||
      typeof player !== "number" ||
      typeof tools !== "number" ||
      !Number.isFinite(library) ||
      !Number.isFinite(player) ||
      !Number.isFinite(tools)
    ) {
      return DEFAULT_SHELL_LAYOUT
    }
    return { library, player, tools }
  } catch {
    return DEFAULT_SHELL_LAYOUT
  }
}

export function saveShellLayout(layout: { [panelId: string]: number }): void {
  try {
    localStorage.setItem(SHELL_LAYOUT_KEY, JSON.stringify(layout))
  } catch {
    /* quota or private mode */
  }
}
