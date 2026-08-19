import type { Hit, SearchScope } from "../types.js"
import { cosine } from "./helpers.js"
import { courseIdOfVideo, recallCaption, videosInScope } from "./tree.js"
import type { LibraryCore } from "./core.js"

export async function collectHits(
  core: LibraryCore,
  input: { text: string; scope: SearchScope; videoIds?: string[] }
): Promise<Hit[]> {
  const { state, deps } = core
  const videos = videosInScope(state, input.scope, input.videoIds)
  for (const video of videos) {
    const courseId = courseIdOfVideo(state, video.id)
    if (courseId && !(video.id in state.embeddings)) core.loadEmbeddingsForCourse(courseId)
  }
  const lexical = lexicalSearch(core, input)
  const hits = [...lexical]
  const seen = new Set(lexical.map((hit) => `${hit.kind}:${hit.videoId}:${hit.startSeconds}:${hit.text}`))
  const needle = input.text.trim()
  if (!needle) return hits
  const [queryVector] = await deps.embedder.embed([needle])
  if (!queryVector || queryVector.every((value) => value === 0)) return hits
  for (const video of videos) {
    const caption = recallCaption(state, video.id)
    for (const item of state.embeddings[video.id] ?? []) {
      const score = cosine(queryVector, item.vector)
      if (score < 0.75) continue
      if (item.kind === "caption" && caption) {
        const segment = caption.segments[item.segmentIndex]
        if (!segment) continue
        const key = `caption:${video.id}:${segment.startSeconds}:${segment.text}`
        if (seen.has(key)) continue
        seen.add(key)
        hits.push({
          videoId: video.id,
          sessionId: video.sessionId,
          startSeconds: segment.startSeconds,
          text: segment.text,
          kind: "caption",
          score
        })
      }
    }
  }
  return hits.slice().sort((a, b) => b.score - a.score)
}

export function lexicalSearch(
  core: LibraryCore,
  input: { text: string; scope: SearchScope; videoIds?: string[] }
): Hit[] {
  const { state } = core
  const needle = input.text.trim().toLowerCase()
  if (!needle) return []
  const tokens = needle
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}]+/gu, ""))
    .filter((token) => token.length >= 3)
  const terms = tokens.length > 0 ? tokens : [needle]
  const hits: Hit[] = []
  for (const video of videosInScope(state, input.scope, input.videoIds)) {
    const caption = recallCaption(state, video.id)
    if (caption) {
      for (const segment of caption.segments) {
        const haystack = segment.text.toLowerCase()
        if (haystack.includes(needle) || terms.some((term) => haystack.includes(term))) {
          hits.push({
            videoId: video.id,
            sessionId: video.sessionId,
            startSeconds: segment.startSeconds,
            text: segment.text,
            kind: "caption",
            score: 1
          })
        }
      }
    }
    for (const note of state.notes.filter((item) => item.videoId === video.id)) {
      if (note.text.toLowerCase().includes(needle)) {
        hits.push({
          videoId: video.id,
          sessionId: video.sessionId,
          startSeconds: note.timestampSeconds,
          text: note.text,
          kind: "note",
          score: 1
        })
      }
    }
  }
  return hits
}
