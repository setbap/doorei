import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const SRT = `1
00:00:08,000 --> 00:00:12,400
useEffect runs after paint

2
00:01:00,000 --> 00:01:04,000
debounce the input
`

export function writeSidecar(dir: string, videoName: string, body = SRT): {
  videoPath: string
  captionPath: string
} {
  mkdirSync(dir, { recursive: true })
  const videoPath = join(dir, videoName)
  const captionPath = join(dir, videoName.replace(/\.mp4$/, ".srt"))
  writeFileSync(videoPath, "fake-video")
  writeFileSync(captionPath, body)
  return { videoPath, captionPath }
}

export { SRT }
