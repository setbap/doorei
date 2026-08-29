import { applyCoursePatch, fieldsForCreate, validateCourseName } from "../courseSettings.js"
import { deleteCourseData, loadCourseEmbeddings } from "../persist/index.js"
import type { Library } from "../types.js"
import type { LibraryCore } from "./core.js"
import { id } from "./helpers.js"

export function coursesApi(core: LibraryCore): Pick<
  Library,
  | "createCourse"
  | "updateCourse"
  | "renameCourse"
  | "deleteCourse"
  | "selectCourse"
  | "createSession"
  | "renameSession"
  | "deleteSession"
  | "reorderSessions"
> {
  const { state, deps } = core
  return {
    async createCourse(name, options) {
      core.assertUsable()
      const courseId = id("crs")
      state.courses.push({
        id: courseId,
        name: validateCourseName(name),
        ...fieldsForCreate(state.appLanguage, options)
      })
      state.selectedCourseId = courseId
      core.emit()
      return courseId
    },
    async updateCourse(courseId, patch) {
      core.assertUsable()
      const index = state.courses.findIndex((item) => item.id === courseId)
      const course = state.courses[index]
      if (!course) throw new Error("Course not found")
      state.courses[index] = applyCoursePatch(course, patch)
      core.emit({ kind: "app" })
    },
    async renameCourse(courseId, name) {
      core.assertUsable()
      const index = state.courses.findIndex((item) => item.id === courseId)
      const course = state.courses[index]
      if (!course) throw new Error("Course not found")
      state.courses[index] = applyCoursePatch(course, { name })
      core.emit({ kind: "app" })
    },
    async deleteCourse(courseId) {
      core.assertUsable()
      const sessionIds = new Set(
        state.sessions.filter((session) => session.courseId === courseId).map((session) => session.id)
      )
      const videoIds = new Set(
        state.videos.filter((video) => sessionIds.has(video.sessionId)).map((video) => video.id)
      )
      state.videos = state.videos.filter((video) => !videoIds.has(video.id))
      state.notes = state.notes.filter((note) => !videoIds.has(note.videoId))
      state.jobs = state.jobs.filter((job) => !videoIds.has(job.videoId))
      for (const videoId of videoIds) {
        delete state.captions[videoId]
        delete state.improvedCaptions[videoId]
        delete state.summaries[videoId]
        delete state.embeddings[videoId]
      }
      state.sessions = state.sessions.filter((session) => session.courseId !== courseId)
      state.courses = state.courses.filter((course) => course.id !== courseId)
      state.conversations = state.conversations.filter((item) => item.courseId !== courseId)
      delete state.activeConversationByCourse[courseId]
      if (state.selectedCourseId === courseId) {
        state.selectedCourseId = state.courses[0]?.id ?? null
        state.selectedVideoId = null
      }
      deleteCourseData(deps.dataDir, courseId)
      if (state.loadedEmbeddingsCourseId === courseId) {
        state.loadedEmbeddingsCourseId = state.selectedCourseId
        state.embeddings = state.selectedCourseId
          ? loadCourseEmbeddings(deps.dataDir, state.selectedCourseId)
          : {}
      }
      core.treeEpoch += 1
      core.emit({ kind: "app" })
    },
    async selectCourse(courseId) {
      core.assertUsable()
      if (!state.courses.some((course) => course.id === courseId)) {
        throw new Error("Course not found")
      }
      state.selectedCourseId = courseId
      state.selectedVideoId = null
      core.loadEmbeddingsForCourse(courseId)
      core.emit({ kind: "app" })
    },
    async createSession(input) {
      core.assertUsable()
      if (!state.selectedCourseId) throw new Error("No Course selected")
      const position = state.sessions.filter((session) => session.courseId === state.selectedCourseId)
        .length
      const sessionId = id("ses")
      state.sessions.push({
        id: sessionId,
        courseId: state.selectedCourseId,
        name: input.name,
        date: input.date ?? null,
        position
      })
      core.emit()
      return sessionId
    },
    async renameSession(sessionId, name) {
      core.assertUsable()
      const session = state.sessions.find((item) => item.id === sessionId)
      if (!session) throw new Error("Session not found")
      session.name = name
      core.emit()
    },
    async deleteSession(sessionId) {
      core.assertUsable()
      const session = state.sessions.find((item) => item.id === sessionId)
      if (!session) throw new Error("Session not found")
      const videoIds = state.videos
        .filter((video) => video.sessionId === sessionId)
        .map((video) => video.id)
      for (const videoId of videoIds) core.removeVideoRecord(videoId)
      state.sessions = state.sessions.filter((item) => item.id !== sessionId)
      state.sessions
        .filter((item) => item.courseId === session.courseId)
        .sort((a, b) => a.position - b.position)
        .forEach((item, index) => {
          item.position = index
        })
      core.emit()
    },
    async reorderSessions(orderedIds) {
      core.assertUsable()
      orderedIds.forEach((sessionId, index) => {
        const session = state.sessions.find((item) => item.id === sessionId)
        if (session) session.position = index
      })
      core.emit()
    }
  }
}
