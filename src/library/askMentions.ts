import type { Caption, Hit, SessionRecord, VideoRecord, AskMention, AskMentionKind } from "./types.js"

export type { AskMention, AskMentionKind }

export type MentionableItem = {
  kind: AskMentionKind
  id: string
  name: string
  path: string
}

export type ResolvedAskMention = MentionableItem

export function mentionableItems(input: {
  selectedCourseId: string | null
  sessions: SessionRecord[]
  videos: VideoRecord[]
}): MentionableItem[] {
  if (!input.selectedCourseId) return []
  const sessions = input.sessions
    .filter((session) => session.courseId === input.selectedCourseId)
    .slice()
    .sort((a, b) => a.position - b.position)
  const items: MentionableItem[] = []
  for (const session of sessions) {
    items.push({ kind: "session", id: session.id, name: session.name, path: "" })
    const videos = input.videos
      .filter((video) => video.sessionId === session.id)
      .slice()
      .sort((a, b) => a.position - b.position)
    for (const video of videos) {
      items.push({
        kind: "video",
        id: video.id,
        name: video.name,
        path: session.name
      })
    }
  }
  return items
}

export function filterMentionable(items: MentionableItem[], query: string): MentionableItem[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return items
  return items.filter((item) => {
    return item.name.toLowerCase().includes(needle) || item.path.toLowerCase().includes(needle)
  })
}

export function activeMention(
  text: string,
  cursor: number
): { at: number; query: string } | null {
  const index = Math.max(0, Math.min(cursor, text.length))
  const before = text.slice(0, index)
  const at = before.lastIndexOf("@")
  if (at < 0) return null
  if (at > 0 && !/\s/.test(before[at - 1] ?? "")) return null
  const query = before.slice(at + 1)
  if (/[\s]/.test(query)) return null
  return { at, query }
}

export function resolveMentionedVideoIds(
  mentions: AskMention[],
  videos: VideoRecord[]
): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const mention of mentions) {
    if (mention.kind === "video") {
      if (!videos.some((video) => video.id === mention.id)) continue
      if (seen.has(mention.id)) continue
      seen.add(mention.id)
      ids.push(mention.id)
      continue
    }
    const inSession = videos
      .filter((video) => video.sessionId === mention.id)
      .slice()
      .sort((a, b) => a.position - b.position)
    for (const video of inSession) {
      if (seen.has(video.id)) continue
      seen.add(video.id)
      ids.push(video.id)
    }
  }
  return ids
}

export function resolveMentions(
  mentions: AskMention[],
  items: MentionableItem[]
): ResolvedAskMention[] {
  const byKey = new Map(items.map((item) => [`${item.kind}:${item.id}`, item]))
  const resolved: ResolvedAskMention[] = []
  const seen = new Set<string>()
  for (const mention of mentions) {
    const key = `${mention.kind}:${mention.id}`
    if (seen.has(key)) continue
    const item = byKey.get(key)
    if (!item) continue
    seen.add(key)
    resolved.push(item)
  }
  return resolved
}

export function mentionCaptionHits(
  videoIds: string[],
  videos: VideoRecord[],
  captions: Record<string, Caption | null | undefined>,
  retrieved: Hit[],
  limitPerVideo = 12
): Hit[] {
  const extra: Hit[] = []
  const seen = new Set(
    retrieved.map((hit) => `${hit.videoId}:${hit.startSeconds}:${hit.text}`)
  )
  for (const videoId of videoIds) {
    const video = videos.find((item) => item.id === videoId)
    const caption = captions[videoId]
    if (!video || !caption) continue
    let added = retrieved.filter((hit) => hit.videoId === videoId).length
    for (const segment of caption.segments) {
      if (added >= limitPerVideo) break
      const key = `${video.id}:${segment.startSeconds}:${segment.text}`
      if (seen.has(key)) continue
      seen.add(key)
      extra.push({
        videoId: video.id,
        sessionId: video.sessionId,
        startSeconds: segment.startSeconds,
        text: segment.text,
        kind: "caption",
        score: 0.4,
        origin: "mention"
      })
      added += 1
    }
  }
  return extra
}

export function userTurnText(question: string, mentions: ResolvedAskMention[]): string {
  const labels = mentions.map((item) => `@${item.name}`).join(" ")
  if (!labels) return question
  return `${labels} ${question}`.trim()
}

export function highlightRanges(
  text: string,
  query: string
): { text: string; match: boolean }[] {
  const needle = query.trim()
  if (!needle) return [{ text, match: false }]
  const lower = text.toLowerCase()
  const find = needle.toLowerCase()
  const parts: { text: string; match: boolean }[] = []
  let from = 0
  while (from < text.length) {
    const index = lower.indexOf(find, from)
    if (index < 0) {
      parts.push({ text: text.slice(from), match: false })
      break
    }
    if (index > from) parts.push({ text: text.slice(from, index), match: false })
    parts.push({ text: text.slice(index, index + needle.length), match: true })
    from = index + needle.length
  }
  return parts.filter((part) => part.text.length > 0)
}
