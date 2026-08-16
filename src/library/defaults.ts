import type { PlayerSettings } from "./types.js"

export const DEFAULT_PROMPTS = {
  improve:
    "Rewrite this Caption with corrected wording. Keep the same Spoken language. Fix technical terms. Return only a JSON array of strings in the same order, one rewritten text per input. Do not change the number of items. Do not include timestamps.",
  summary:
    "Write a Summary of this Video in the requested Output language so the learner can re-read what it covered without watching. Use Markdown (headings, lists, bold). Return only the Markdown, with no wrapping code fence.",
  ask: "Answer the question using only the provided Hits. Cite those Hits. Write in the requested Output language."
}

export const LEGACY_IMPROVE_PROMPT =
  "Rewrite this Caption with corrected wording. Keep the same timestamps and the same Spoken language. Fix technical terms. Return only a JSON array of {startSeconds, endSeconds, text}."

export const DEFAULT_SETTINGS: PlayerSettings = {
  autoplay: false,
  confetti: false,
  playbackSpeed: 1,
  subtitlesVisible: true,
  autoMarkWatchedAtEnd: true,
  captionColor: "#ffffff",
  captionBackground: "#000000b8",
  askContextBudgetTokens: 24_000
}
