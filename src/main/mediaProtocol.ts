import { createReadStream, statSync } from "node:fs"
import { extname } from "node:path"
import { Readable } from "node:stream"
import { fileURLToPath, pathToFileURL } from "node:url"

export const MEDIA_HOST = "doorei"

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo"
}

export function toMediaUrl(filePath: string, origin?: string): string {
  const absolute = filePath.startsWith("file:") ? fileURLToPath(filePath) : filePath
  if (origin) return `${origin}/?p=${encodeURIComponent(absolute)}`
  return `media://${MEDIA_HOST}${pathToFileURL(absolute).pathname}`
}

export function filePathFromMediaRequest(requestUrl: string): string {
  const url = new URL(requestUrl)
  const queryPath = url.searchParams.get("p")
  if (queryPath) return queryPath
  if (url.hostname === MEDIA_HOST || url.hostname === "media.localhost") {
    const payload = url.pathname.replace(/^\/+/, "").replace(/\/$/, "")
    if (payload && !payload.includes("/") && !payload.includes("%")) {
      const decoded = Buffer.from(payload, "base64url").toString("utf8")
      if (decoded.startsWith("/") || /^[A-Za-z]:[\\/]/.test(decoded)) return decoded
    }
    return fileURLToPath(new URL(`file://${url.pathname}`))
  }
  return fileURLToPath(new URL(`file:///${url.host}${url.pathname}`))
}

export function planMediaServe(
  rangeHeader: string | null,
  size: number
): {
  status: number
  start: number
  end: number
  headers: Record<string, string>
} {
  const typeHeaders = { "Accept-Ranges": "bytes" }
  if (!rangeHeader) {
    return {
      status: 200,
      start: 0,
      end: size - 1,
      headers: {
        ...typeHeaders,
        "Content-Length": String(size)
      }
    }
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
  if (!match) {
    return {
      status: 416,
      start: 0,
      end: -1,
      headers: {
        ...typeHeaders,
        "Content-Range": `bytes */${size}`
      }
    }
  }
  const start = match[1] ? Number(match[1]) : 0
  const end = match[2] ? Number(match[2]) : size - 1
  if (start < 0 || end < start || start >= size) {
    return {
      status: 416,
      start: 0,
      end: -1,
      headers: {
        ...typeHeaders,
        "Content-Range": `bytes */${size}`
      }
    }
  }
  const last = Math.min(end, size - 1)
  return {
    status: 206,
    start,
    end: last,
    headers: {
      ...typeHeaders,
      "Content-Length": String(last - start + 1),
      "Content-Range": `bytes ${start}-${last}/${size}`
    }
  }
}

export async function serveMediaRequest(
  requestUrl: string,
  rangeHeader: string | null
): Promise<{ status: number; headers: Record<string, string>; chunks: Buffer[] }> {
  const filePath = filePathFromMediaRequest(requestUrl)
  const size = statSync(filePath).size
  const planned = planMediaServe(rangeHeader, size)
  const headers = {
    ...planned.headers,
    "Content-Type": MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream"
  }
  if (planned.status === 416 || planned.end < planned.start) {
    return { status: planned.status, headers, chunks: [] }
  }
  const chunks: Buffer[] = []
  const stream = createReadStream(filePath, { start: planned.start, end: planned.end })
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk))
  }
  return { status: planned.status, headers, chunks }
}

export function openMediaFile(
  filePath: string,
  rangeHeader: string | null,
  method = "GET"
): {
  status: number
  headers: Record<string, string>
  stream: ReturnType<typeof createReadStream> | null
} {
  const size = statSync(filePath).size
  const planned = planMediaServe(rangeHeader, size)
  const headers: Record<string, string> = {
    ...planned.headers,
    "Content-Type": MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Range",
    "Access-Control-Expose-Headers": "Accept-Ranges, Content-Range, Content-Length, Content-Type"
  }
  if (planned.status === 416 || planned.end < planned.start || method === "HEAD") {
    return { status: planned.status, headers, stream: null }
  }
  const stream = createReadStream(filePath, { start: planned.start, end: planned.end })
  stream.on("error", () => undefined)
  return { status: planned.status, headers, stream }
}

export function mediaResponse(request: Request): Response {
  try {
    const opened = openMediaFile(
      filePathFromMediaRequest(request.url),
      request.headers.get("range"),
      request.method
    )
    if (!opened.stream) {
      return new Response(null, { status: opened.status, headers: opened.headers })
    }
    return new Response(Readable.toWeb(opened.stream) as ReadableStream, {
      status: opened.status,
      headers: opened.headers
    })
  } catch {
    return new Response("Not found", { status: 404 })
  }
}
