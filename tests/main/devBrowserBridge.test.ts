import { describe, expect, test } from "vitest"
import {
  handleDevBridgeHttp,
  startDevBrowserBridge,
  type DevBrowserBridgeApi
} from "../../src/main/devBrowserBridge.js"
import type { LibrarySnapshot } from "../../src/library/types.js"
import type { AppUpdateStatus } from "../../src/main/appUpdate.js"
import { DEFAULT_SETTINGS } from "../../src/library/defaults.js"

describe("dev browser bridge", () => {
  test("GET /snapshot returns the current Library snapshot", async () => {
    const snapshot = fakeSnapshot({ appLanguage: "fa" })
    const result = await handleDevBridgeHttp("GET", "/snapshot", "", fakeApi({ snapshot: () => snapshot }))
    expect(result).toEqual({ status: 200, body: snapshot })
  })

  test("POST /call runs a Library method and wraps the result", async () => {
    const result = await handleDevBridgeHttp(
      "POST",
      "/call",
      JSON.stringify({ method: "selectVideo", args: ["vid-1"] }),
      fakeApi({
        call: async (method, args) => {
          expect(method).toBe("selectVideo")
          expect(args).toEqual(["vid-1"])
          return "ok"
        }
      })
    )
    expect(result).toEqual({ status: 200, body: { result: "ok" } })
  })

  test("POST /call without a method is rejected", async () => {
    const result = await handleDevBridgeHttp("POST", "/call", "{}", fakeApi())
    expect(result.status).toBe(400)
  })

  test("unknown paths are 404", async () => {
    const result = await handleDevBridgeHttp("GET", "/nope", "", fakeApi())
    expect(result.status).toBe(404)
  })

  test("browser can fetch a snapshot over HTTP with CORS", async () => {
    const snapshot = fakeSnapshot({ usable: true, appLanguage: "en" })
    const bridge = await startDevBrowserBridge(fakeApi({ snapshot: () => snapshot }), { port: 0 })
    try {
      const preflight = await fetch(`${bridge.origin}/snapshot`, { method: "OPTIONS" })
      expect(preflight.status).toBe(204)
      expect(preflight.headers.get("access-control-allow-origin")).toBe("*")

      const response = await fetch(`${bridge.origin}/snapshot`)
      expect(response.ok).toBe(true)
      expect(await response.json()).toEqual(snapshot)
    } finally {
      await bridge.close()
    }
  })

  test("event stream starts with the current snapshot", async () => {
    const snapshot = fakeSnapshot({ appLanguage: "fa" })
    const bridge = await startDevBrowserBridge(fakeApi({ snapshot: () => snapshot }), { port: 0 })
    try {
      const response = await fetch(`${bridge.origin}/events`)
      expect(response.headers.get("content-type")).toContain("text/event-stream")
      const reader = response.body?.getReader()
      expect(reader).toBeTruthy()
      const { value } = await reader!.read()
      const chunk = new TextDecoder().decode(value)
      expect(chunk).toContain("event: snapshot")
      expect(chunk).toContain("\"appLanguage\":\"fa\"")
      await reader!.cancel()
    } finally {
      await bridge.close()
    }
  })
})

function fakeSnapshot(patch: Partial<LibrarySnapshot> = {}): LibrarySnapshot {
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
    prompts: { improve: "i", summary: "s", ask: "a" },
    requiredModels: [],
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
    selectedCourseName: null,
    ...patch
  }
}

function fakeApi(patch: Partial<DevBrowserBridgeApi> = {}): DevBrowserBridgeApi {
  const snapshot = fakeSnapshot()
  const update: AppUpdateStatus = { kind: "disabled" }
  return {
    snapshot: () => snapshot,
    subscribeSnapshot: () => () => undefined,
    call: async () => undefined,
    appVersion: () => "0.3.0",
    updateStatus: () => update,
    checkForUpdate: async () => update,
    installUpdate: () => undefined,
    subscribeUpdate: () => () => undefined,
    mediaUrl: (filePath) => `http://127.0.0.1:9/?p=${encodeURIComponent(filePath)}`,
    pickVideos: async () => [],
    pickFolderVideos: async () => [],
    pickFile: async () => null,
    pickDirectory: async () => null,
    openUrl: async () => undefined,
    ...patch
  }
}
