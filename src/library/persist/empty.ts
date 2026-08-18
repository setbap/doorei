import { DEFAULT_SETTINGS } from "../defaults.js"
import type { LibraryState } from "./types.js"

export function emptyLibraryState(): LibraryState {
  return {
    appLanguage: null,
    provider: null,
    providerVault: {},
    settings: { ...DEFAULT_SETTINGS },
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
