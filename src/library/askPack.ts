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
  sessionId: string | null
): { videoHits: Hit[]; sessionHits: Hit[]; courseHits: Hit[]; packedHits: Hit[] } {
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
  return { videoHits, sessionHits, courseHits, packedHits: [...videoHits, ...sessionHits, ...courseHits] }
}

export function sessionSummarySnippets(
  sessionHits: Hit[],
  summaries: Record<string, string>
): { videoId: string; text: string }[] {
  if (sessionHits.length === 0) return []
  return [...new Set(sessionHits.map((hit) => hit.videoId))].slice(0, 8).flatMap((videoId) => {
    const text = summaries[videoId]
    return text ? [{ videoId, text }] : []
  })
}
