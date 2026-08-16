import type { Job, LibrarySnapshot } from "../../../library/types.js"

export function providerKindLabel(kind: string | undefined): string {
  if (!kind) return ""
  return kind.charAt(0).toUpperCase() + kind.slice(1)
}

export function jobStatusLine(snapshot: LibrarySnapshot, jobs: Job[]): string {
  return jobs
    .map((job) => {
      const name = snapshot.videos.find((video) => video.id === job.videoId)?.name
      const file = name ? ` ${name}` : ""
      const percent = job.progress ? ` ${Math.round(job.progress * 100)}%` : ""
      const error = job.error ? ` ${job.error}` : ""
      return `${job.kind}:${job.status}${file}${percent}${error}`
    })
    .join(" · ")
}

export function fireConfetti(): void {
  const node = document.createElement("div")
  node.textContent = "✦"
  node.style.cssText =
    "position:fixed;inset:0;display:grid;place-items:center;font-size:64px;pointer-events:none;z-index:50"
  document.body.append(node)
  setTimeout(() => node.remove(), 800)
}
