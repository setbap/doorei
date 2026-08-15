import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { filePathFromMediaRequest, openMediaFile } from "./mediaProtocol.js"

export function startMediaServer(): Promise<{ origin: string; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      serve(request, response)
    })
    server.on("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") {
        reject(new Error("Media server failed to bind"))
        return
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise((done, fail) => {
            server.close((error) => (error ? fail(error) : done()))
          })
      })
    })
  })
}

function serve(request: IncomingMessage, response: ServerResponse): void {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Range",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS"
    })
    response.end()
    return
  }
  try {
    const filePath = filePathFromMediaRequest(`http://127.0.0.1${request.url ?? "/"}`)
    const range = headerValue(request.headers.range)
    const opened = openMediaFile(filePath, range, request.method ?? "GET")
    response.writeHead(opened.status, opened.headers)
    if (!opened.stream) {
      response.end()
      return
    }
    request.on("close", () => opened.stream?.destroy())
    opened.stream.pipe(response)
  } catch {
    response.writeHead(404, { "Access-Control-Allow-Origin": "*" })
    response.end("Not found")
  }
}

function headerValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}
