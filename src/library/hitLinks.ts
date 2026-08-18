import type { Hit } from "./types.js"

export function linkHitCitations(text: string, hits: Hit[] = []): string {
  return text
    .replace(/(\s*)\[Hit:\s*([^\]]*)\](\s*)/gi, (_match, lead: string, body: string, trail: string) => {
      const parsed = parseHitCitation(body)
      const target = parsed ? resolveHitTarget(parsed.videoId, parsed.seconds, hits) : null
      if (!target) return lead && trail ? " " : lead || trail
      const stamp = formatStamp(target.seconds)
      return `${lead}[${stamp}](#hit/${encodeURIComponent(target.videoId)}/${target.seconds})${trail}`
    })
    .replace(/ +([.!?،؛])/g, "$1")
}

export function resolveHit(
  href: string | undefined,
  label: string,
  hits: Hit[] | undefined
): { videoId: string; seconds: number } | null {
  const fromHref = href ? parseHitHref(href) : null
  const seconds = parseStamp(label) ?? fromHref?.seconds
  if (seconds == null) {
    if (!fromHref) return null
    return resolveHitTarget(fromHref.videoId, fromHref.seconds, hits)
  }
  return resolveHitTarget(fromHref?.videoId ?? "", seconds, hits)
}

function parseHitCitation(body: string): { videoId: string; seconds: number } | null {
  const trimmed = body.trim()
  const match =
    trimmed.match(/^(\S+)\s*@\s*([\d.]+)s?\b/i) ?? trimmed.match(/^(\S+)\s*[,،]\s*([\d.]+)s?\b/i)
  if (!match) return null
  const videoId = match[1] ?? ""
  const seconds = Number(match[2])
  if (!videoId || !Number.isFinite(seconds)) return null
  return { videoId, seconds }
}

function resolveHitTarget(
  videoId: string,
  seconds: number,
  hits: Hit[] | undefined
): { videoId: string; seconds: number } | null {
  if (!Number.isFinite(seconds)) return null
  const list = hits ?? []
  const prefix = videoId.replace(/\.+$/, "")
  const timeMatch = (hit: Hit): boolean =>
    hit.startSeconds != null && Math.abs(hit.startSeconds - seconds) < 1

  const exact =
    prefix.length > 0
      ? list.find((hit) => hit.videoId === videoId && timeMatch(hit))
      : undefined
  if (exact?.startSeconds != null) {
    return { videoId: exact.videoId, seconds: exact.startSeconds }
  }

  const byPrefix =
    prefix.length >= 8
      ? list.find((hit) => hit.videoId.startsWith(prefix) && timeMatch(hit))
      : undefined
  if (byPrefix?.startSeconds != null) {
    return { videoId: byPrefix.videoId, seconds: byPrefix.startSeconds }
  }

  return null
}

function parseHitHref(href: string): { videoId: string; seconds: number } | null {
  const hashIndex = href.indexOf("#hit/")
  const body = hashIndex >= 0 ? href.slice(hashIndex + 1) : href.replace(/^#/, "")
  const parts = body.split("/")
  if (parts[0] !== "hit" || parts.length < 3) return null
  const parsedId = decodeURIComponent(parts[1] ?? "")
  const seconds = Number(parts[2])
  if (!parsedId || !Number.isFinite(seconds)) return null
  return { videoId: parsedId, seconds }
}

export function parseStamp(label: string): number | null {
  const match = label.trim().match(/^(\d+):(\d{2})(?::(\d{2}))?$/)
  if (!match) return null
  if (match[3] != null) {
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
  }
  return Number(match[1]) * 60 + Number(match[2])
}

export function formatStamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const total = Math.floor(seconds)
  const minutes = Math.floor(total / 60)
  const secs = total % 60
  return `${minutes}:${String(secs).padStart(2, "0")}`
}
