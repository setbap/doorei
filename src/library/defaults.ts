import type { PlayerSettings } from "./types.js"

export const COURSE_NAME_MIN = 1
export const COURSE_NAME_MAX = 120
export const COURSE_PROMPT_MIN = 14
export const COURSE_PROMPT_MAX = 8000

export const DEFAULT_PROMPTS = {
  improve:
    "Rewrite this Caption with corrected wording. Keep the same Spoken language. Fix technical terms. Return only a JSON array of strings in the same order, one rewritten text per input. Do not change the number of items. Do not include timestamps.",
  summary:
    "Write a Summary of this Video in the requested Output language so the learner can re-read what it covered without watching. Use Markdown (headings, lists, bold). Return only the Markdown, with no wrapping code fence.",
  ask: "Answer the question using only the provided Hits and any attached mentioned Video Captions or Summaries. Cite each Hit as [Hit: videoId @ seconds] using that Hit's Video id, never a label such as video, session, course, or mention. Write in the requested Output language."
}

export const LEGACY_IMPROVE_PROMPT =
  "Rewrite this Caption with corrected wording. Keep the same timestamps and the same Spoken language. Fix technical terms. Return only a JSON array of {startSeconds, endSeconds, text}."

export const LEGACY_ASK_PROMPT =
  "Answer the question using only the provided Hits. Cite those Hits. Write in the requested Output language."

export const PREVIOUS_ASK_PROMPT =
  "Answer the question using only the provided Hits. Cite each Hit as [Hit: videoId @ seconds] using that Hit's Video id, never a label such as video, session, or course. Write in the requested Output language."

export const DEFAULT_SETTINGS: PlayerSettings = {
  autoplay: true,
  confetti: false,
  playbackSpeed: 1,
  subtitlesVisible: true,
  autoMarkWatchedAtEnd: true,
  captionColor: "#ffffff",
  captionBackground: "#000000b8",
  askContextBudgetTokens: 24_000
}
