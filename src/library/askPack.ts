import type { ConversationTurn, Hit } from "./types.js"

const CHARS_PER_TOKEN = 4

export const ASK_COMPACT_SYSTEM =
  "Compact these earlier Ask turns into a short recap. Preserve cited lecture facts. Do not invent new lecture facts. Do not answer a new question. Return only the recap text."

export function takeHits(hits: Hit[], limit: number): Hit[] {
  return hits
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export function askTokenCount(prompt: string): number {
  return Math.ceil(prompt.length / CHARS_PER_TOKEN)
}

export function historyForPack(
  turns: ConversationTurn[]
): { kind: ConversationTurn["kind"]; text: string }[] {
  return turns.map((turn) => ({ kind: turn.kind, text: turn.text }))
}

export function packAskHits(
  allHits: Hit[],
  videoId: string | null,
  sessionId: string | null,
  mentionedVideoIds: string[] = []
): {
  videoHits: Hit[]
  sessionHits: Hit[]
  courseHits: Hit[]
  mentionHits: Hit[]
  packedHits: Hit[]
} {
  if (mentionedVideoIds.length > 0) {
    const mentionHits = packMentionHits(allHits, mentionedVideoIds)
    return {
      videoHits: [],
      sessionHits: [],
      courseHits: [],
      mentionHits,
      packedHits: mentionHits
    }
  }
  const videoHits = takeHits(
    videoId
      ? allHits
          .filter((hit) => hit.videoId === videoId)
          .map((hit) => ({ ...hit, origin: "video" as const }))
      : [],
    8
  )
  const sessionHits = takeHits(
    videoId
      ? allHits
          .filter((hit) => hit.sessionId === sessionId && hit.videoId !== videoId)
          .map((hit) => ({ ...hit, origin: "session" as const }))
      : [],
    6
  )
  const courseHits = takeHits(
    videoId
      ? allHits
          .filter((hit) => hit.sessionId !== sessionId)
          .map((hit) => ({ ...hit, origin: "course" as const }))
      : allHits.map((hit) => ({ ...hit, origin: "course" as const })),
    6
  )
  return {
    videoHits,
    sessionHits,
    courseHits,
    mentionHits: [],
    packedHits: [...videoHits, ...sessionHits, ...courseHits]
  }
}

const MENTION_HITS_PER_VIDEO = 12

function packMentionHits(allHits: Hit[], mentionedVideoIds: string[]): Hit[] {
  const packed: Hit[] = []
  for (const videoId of mentionedVideoIds) {
    packed.push(
      ...takeHits(
        allHits
          .filter((hit) => hit.videoId === videoId)
          .map((hit) => ({ ...hit, origin: "mention" as const })),
        MENTION_HITS_PER_VIDEO
      )
    )
  }
  return packed
}

export function sessionSummarySnippets(
  sessionHits: Hit[],
  summaries: Record<string, string>
): { videoId: string; text: string }[] {
  if (sessionHits.length === 0) return []
  return summarySnippets(
    sessionHits.map((hit) => hit.videoId),
    summaries
  )
}

export function summarySnippets(
  videoIds: string[],
  summaries: Record<string, string>,
  limit = 8
): { videoId: string; text: string }[] {
  return [...new Set(videoIds)].slice(0, limit).flatMap((videoId) => {
    const text = summaries[videoId]
    return text ? [{ videoId, text }] : []
  })
}
