import { useMemo } from "react"
import type { LibrarySnapshot } from "../../../library/types.js"
import { courseWatchProgress } from "../../../library/courseProgress.js"

export function CourseProgress({ snapshot }: { snapshot: LibrarySnapshot }) {
  const progress = useMemo(() => {
    const sessionIds = new Set(
      snapshot.sessions
        .filter((session) => session.courseId === snapshot.selectedCourseId)
        .map((session) => session.id)
    )
    return courseWatchProgress(snapshot.videos.filter((video) => sessionIds.has(video.sessionId)))
  }, [snapshot.sessions, snapshot.videos, snapshot.selectedCourseId])
  return (
    <div
      className="flex min-w-0 max-w-xs items-center gap-2"
      title={snapshot.selectedCourseName ?? undefined}
    >
      <div className="h-1 min-w-12 flex-1 overflow-hidden rounded-full bg-white/15">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <span className="shrink-0 tabular-nums">{progress.label}</span>
    </div>
  )
}
