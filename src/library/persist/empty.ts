import { DEFAULT_PROMPTS, DEFAULT_SETTINGS } from "../defaults.js"
import type { LibraryState } from "./types.js"

export function emptyLibraryState(): LibraryState {
  return {
    appLanguage: null,
    outputLanguage: null,
    provider: null,
    providerVault: {},
    spokenLanguageDefault: "fa",
    settings: { ...DEFAULT_SETTINGS },
    prompts: { ...DEFAULT_PROMPTS },
    selectedCourseId: null,
    selectedVideoId: null,
    activity: "summary",
    gatePassed: false,
    courses: [],
    sessions: [],
    videos: [],
    notes: [],
    captions: {},
    improvedCaptions: {},
    summaries: {},
    embeddings: {},
    jobs: [],
    searchHits: [],
    conversations: [],
    activeConversationByCourse: {},
    lastAskError: null
  }
}
