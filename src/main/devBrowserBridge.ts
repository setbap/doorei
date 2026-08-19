import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { LibrarySnapshot } from "../library/types.js"
import type { AppUpdateStatus } from "./appUpdate.js"

export const DEV_BROWSER_BRIDGE_PORT = 5174
export const DEV_BROWSER_BRIDGE_ORIGIN = `http://127.0.0.1:${DEV_BROWSER_BRIDGE_PORT}`

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
}

export type DevBrowserBridgeApi = {
  snapshot: () => LibrarySnapshot
  subscribeSnapshot: (listener: (snapshot: LibrarySnapshot) => void) => () => void
  call: (method: string, args: unknown[]) => Promise<unknown>
  appVersion: () => string
  updateStatus: () => AppUpdateStatus
  checkForUpdate: () => Promise<AppUpdateStatus>
  installUpdate: () => Promise<void> | void
  subscribeUpdate: (listener: (status: AppUpdateStatus) => void) => () => void
  mediaUrl: (filePath: string) => string
  pickVideos: () => Promise<string[]>
  pickFolderVideos: () => Promise<string[]>
  pickFile: () => Promise<string | null>
  pickDirectory: () => Promise<string | null>
  openUrl: (url: string) => Promise<void>
}

export function startDevBrowserBridge(
  api: DevBrowserBridgeApi,
  options: { port?: number } = {}
): Promise<{ origin: string; close: () => Promise<void> }> {
  const port = options.port ?? DEV_BROWSER_BRIDGE_PORT
  const clients = new Set<ServerResponse>()

  const stopSnapshot = api.subscribeSnapshot((snapshot) => {
    for (const client of clients) writeEvent(client, "snapshot", snapshot)
  })
  const stopUpdate = api.subscribeUpdate((status) => {
    for (const client of clients) writeEvent(client, "update", status)
  })

  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      void serve(request, response, api, clients)
    })
    server.on("error", reject)
    server.listen(port, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") {
        reject(new Error("Dev browser bridge failed to bind"))
        return
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise((done, fail) => {
            stopSnapshot()
            stopUpdate()
            for (const client of clients) client.end()
            clients.clear()
            server.close((error) => (error ? fail(error) : done()))
          })
      })
    })
  })
}

async function serve(
  request: IncomingMessage,
  response: ServerResponse,
  api: DevBrowserBridgeApi,
  clients: Set<ServerResponse>
): Promise<void> {
  if (request.method === "OPTIONS") {
    response.writeHead(204, CORS)
    response.end()
    return
  }

  const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname
  if (request.method === "GET" && path === "/events") {
    attachEventStream(request, response, api, clients)
    return
  }

  try {
    const result = await handleDevBridgeHttp(request.method ?? "GET", path, await readBody(request), api)
    response.writeHead(result.status, { ...CORS, "Content-Type": "application/json" })
    response.end(JSON.stringify(result.body))
  } catch (error) {
    response.writeHead(500, { ...CORS, "Content-Type": "application/json" })
    response.end(JSON.stringify({ error: errorMessage(error) }))
  }
}

export async function handleDevBridgeHttp(
  method: string,
  path: string,
  rawBody: string,
  api: DevBrowserBridgeApi
): Promise<{ status: number; body: unknown }> {
  if (method === "GET" && path === "/snapshot") return { status: 200, body: api.snapshot() }
  if (method === "GET" && path === "/version") return { status: 200, body: { version: api.appVersion() } }
  if (method === "GET" && path === "/update") return { status: 200, body: api.updateStatus() }
  if (method === "POST" && path === "/update/check") return { status: 200, body: await api.checkForUpdate() }
  if (method === "POST" && path === "/update/install") {
    await api.installUpdate()
    return { status: 200, body: {} }
  }
  if (method === "POST" && path === "/call") {
    const payload = jsonBody(rawBody) as { method?: unknown; args?: unknown }
    if (typeof payload.method !== "string") {
      return { status: 400, body: { error: "Missing Library method" } }
    }
    const args = Array.isArray(payload.args) ? payload.args : []
    return { status: 200, body: { result: await api.call(payload.method, args) } }
  }
  if (method === "POST" && path === "/media-url") {
    const payload = jsonBody(rawBody) as { filePath?: unknown }
    if (typeof payload.filePath !== "string") {
      return { status: 400, body: { error: "Missing file path" } }
    }
    return { status: 200, body: { url: api.mediaUrl(payload.filePath) } }
  }
  if (method === "POST" && path === "/pick/videos") {
    return { status: 200, body: { paths: await api.pickVideos() } }
  }
  if (method === "POST" && path === "/pick/folder") {
    return { status: 200, body: { paths: await api.pickFolderVideos() } }
  }
  if (method === "POST" && path === "/pick/file") {
    return { status: 200, body: { path: await api.pickFile() } }
  }
  if (method === "POST" && path === "/pick/directory") {
    return { status: 200, body: { path: await api.pickDirectory() } }
  }
  if (method === "POST" && path === "/open-url") {
    const payload = jsonBody(rawBody) as { url?: unknown }
    if (typeof payload.url !== "string") return { status: 400, body: { error: "Missing URL" } }
    await api.openUrl(payload.url)
    return { status: 200, body: {} }
  }
  return { status: 404, body: { error: "Not found" } }
}

function attachEventStream(
  request: IncomingMessage,
  response: ServerResponse,
  api: DevBrowserBridgeApi,
  clients: Set<ServerResponse>
): void {
  response.writeHead(200, {
    ...CORS,
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  })
  clients.add(response)
  writeEvent(response, "snapshot", api.snapshot())
  writeEvent(response, "update", api.updateStatus())
  request.on("close", () => {
    clients.delete(response)
  })
}

function writeEvent(response: ServerResponse, event: string, data: unknown): void {
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on("data", (chunk) => chunks.push(chunk as Buffer))
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    request.on("error", reject)
  })
}

function jsonBody(raw: string): unknown {
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
