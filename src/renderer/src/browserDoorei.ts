import { DEFAULT_PROMPTS, DEFAULT_SETTINGS } from "../../library/defaults.js"
import { REQUIRED_MODELS } from "../../library/models.js"
import type { LibrarySnapshot } from "../../library/types.js"
import type { AppUpdateStatus } from "../../main/appUpdate.js"

export const DEV_BROWSER_BRIDGE_ORIGIN = "http://127.0.0.1:5174"

type DooreiApi = Window["doorei"]

type BrowserDooreiOptions = {
  origin?: string
  fetch?: typeof fetch
  EventSource?: typeof EventSource
  userAgent?: string
  openUrl?: (url: string) => void
}

export function offlineBrowserSnapshot(): LibrarySnapshot {
  return {
    usable: false,
    appLanguage: null,
    outputLanguage: "fa",
    direction: "rtl",
    providerConfigured: false,
    provider: null,
    providerVault: {},
    spokenLanguageDefault: "fa",
    settings: { ...DEFAULT_SETTINGS },
    prompts: { ...DEFAULT_PROMPTS },
    requiredModels: Object.values(REQUIRED_MODELS).map((id) => ({ id, complete: false })),
    courses: [],
    selectedCourseId: null,
    selectedVideoId: null,
    sessions: [],
    videos: [],
    notes: [],
    caption: null,
    improvedCaption: null,
    summary: null,
    jobs: [],
    searchHits: [],
    conversations: [],
    activeConversationId: null,
    conversationTurns: [],
    askError: null,
    askOff: true,
    activity: "summary",
    selectedCourseName: null
  }
}

export function browserPlatform(userAgent = navigator.userAgent): string {
  if (userAgent.includes("Mac")) return "darwin"
  if (userAgent.includes("Windows")) return "win32"
  return "linux"
}

export function createBrowserDoorei(options: BrowserDooreiOptions = {}): DooreiApi {
  const origin = options.origin ?? DEV_BROWSER_BRIDGE_ORIGIN
  const request = options.fetch ?? fetch
  const Source = options.EventSource ?? globalThis.EventSource
  const openUrl = options.openUrl ?? ((url: string) => window.open(url, "_blank", "noopener"))

  async function getJson<T>(path: string): Promise<T> {
    const response = await request(`${origin}${path}`)
    if (!response.ok) throw new Error(`Dev bridge ${path} failed`)
    return (await response.json()) as T
  }

  async function postJson<T>(path: string, body: unknown): Promise<T> {
    const response = await request(`${origin}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      throw new Error(payload.error ?? `Dev bridge ${path} failed`)
    }
    return (await response.json()) as T
  }

  return {
    platform: browserPlatform(options.userAgent),
    appVersion: async () => {
      try {
        const payload = await getJson<{ version: string }>("/version")
        return payload.version
      } catch {
        return "dev"
      }
    },
    updateStatus: async () => {
      try {
        return await getJson<AppUpdateStatus>("/update")
      } catch {
        return { kind: "disabled" }
      }
    },
    checkForUpdate: () => postJson<AppUpdateStatus>("/update/check", {}),
    installUpdate: async () => {
      await postJson("/update/install", {})
    },
    subscribeUpdate: (listener) => subscribeEvent(Source, origin, "update", listener, request),
    snapshot: async () => {
      try {
        return await getJson<LibrarySnapshot>("/snapshot")
      } catch {
        return offlineBrowserSnapshot()
      }
    },
    call: async (method, ...args) => {
      const payload = await postJson<{ result: unknown }>("/call", { method, args })
      return payload.result
    },
    subscribe: (listener) => subscribeEvent(Source, origin, "snapshot", listener, request),
    mediaUrl: async (filePath) => {
      const payload = await postJson<{ url: string }>("/media-url", { filePath })
      return payload.url
    },
    pickVideos: async () => {
      const payload = await postJson<{ paths: string[] }>("/pick/videos", {})
      return payload.paths
    },
    pickFolderVideos: async () => {
      const payload = await postJson<{ paths: string[] }>("/pick/folder", {})
      return payload.paths
    },
    pickFile: async () => {
      const payload = await postJson<{ path: string | null }>("/pick/file", {})
      return payload.path
    },
    pickDirectory: async () => {
      const payload = await postJson<{ path: string | null }>("/pick/directory", {})
      return payload.path
    },
    openUrl: async (url) => {
      openUrl(url)
    },
    onShortcut: () => () => undefined,
    onSelectAll: () => () => undefined
  }
}

export function installBrowserDoorei(): void {
  const target = window as Window & { doorei?: Window["doorei"] }
  if (target.doorei) {
    document.documentElement.dataset.runtime = "electron"
    return
  }
  target.doorei = createBrowserDoorei()
  document.documentElement.dataset.runtime = "browser"
}

function subscribeEvent<T>(
  Source: typeof EventSource | undefined,
  origin: string,
  event: "snapshot" | "update",
  listener: (value: T) => void,
  request: typeof fetch
): () => void {
  if (!Source) return () => undefined
  const source = new Source(`${origin}/events`)
  const onEvent = (message: MessageEvent<string>) => {
    listener(JSON.parse(message.data) as T)
  }
  source.addEventListener(event, onEvent as EventListener)
  source.onopen = () => {
    const path = event === "snapshot" ? "/snapshot" : "/update"
    void request(`${origin}${path}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (value) listener(value as T)
      })
      .catch(() => undefined)
  }
  return () => source.close()
}
