import type { LibrarySnapshot } from "../../../library/types.js"

export function orderedCourses(snapshot: LibrarySnapshot) {
  const selected = snapshot.courses.filter((course) => course.id === snapshot.selectedCourseId)
  const others = snapshot.courses.filter((course) => course.id !== snapshot.selectedCourseId)
  return [...selected, ...others]
}
