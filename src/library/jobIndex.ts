import type { Job } from "./types.js"

export type VideoJobState = {
  failed: Job[]
  pipeline: Job[]
  hasCompleteSummary: boolean
}

export function indexJobsByVideo(jobs: Job[]): Map<string, VideoJobState> {
  const map = new Map<string, VideoJobState>()
  for (const job of jobs) {
    let entry = map.get(job.videoId)
    if (!entry) {
      entry = { failed: [], pipeline: [], hasCompleteSummary: false }
      map.set(job.videoId, entry)
    }
    if (job.status === "failed") entry.failed.push(job)
    if (
      (job.kind === "improve" || job.kind === "summary") &&
      (job.status === "queued" || job.status === "running")
    ) {
      entry.pipeline.push(job)
    }
    if (job.kind === "summary" && job.status === "complete") entry.hasCompleteSummary = true
  }
  return map
}
