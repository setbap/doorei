import {
  COURSE_NAME_MAX,
  COURSE_NAME_MIN,
  COURSE_PROMPT_MAX,
  COURSE_PROMPT_MIN,
  DEFAULT_PROMPTS,
  LEGACY_ASK_PROMPT,
  PREVIOUS_ASK_PROMPT,
  LEGACY_IMPROVE_PROMPT
} from "./defaults.js"
import type { LibraryState } from "./persist/types.js"
import type {
  AppLanguage,
  CoursePrompts,
  CourseRecord,
  CourseSettingsInput,
  SpokenLanguage
} from "./types.js"

export {
  COURSE_NAME_MAX,
  COURSE_NAME_MIN,
  COURSE_PROMPT_MAX,
  COURSE_PROMPT_MIN
}

export function migratePrompts(loaded: Partial<CoursePrompts> | undefined): CoursePrompts {
  const prompts = { ...DEFAULT_PROMPTS, ...loaded }
  if (!loaded?.improve || loaded.improve === LEGACY_IMPROVE_PROMPT) {
    prompts.improve = DEFAULT_PROMPTS.improve
  }
  if (!loaded?.ask || loaded.ask === LEGACY_ASK_PROMPT || loaded.ask === PREVIOUS_ASK_PROMPT) {
    prompts.ask = DEFAULT_PROMPTS.ask
  }
  return prompts
}

export function appLanguageOrFa(language: AppLanguage | null | undefined): AppLanguage {
  return language === "en" || language === "fa" ? language : "fa"
}

export function defaultCourseFields(
  appLanguage: AppLanguage | null | undefined
): Pick<CourseRecord, "spokenLanguageDefault" | "outputLanguage" | "prompts"> {
  const language = appLanguageOrFa(appLanguage)
  return {
    spokenLanguageDefault: language,
    outputLanguage: language,
    prompts: { ...DEFAULT_PROMPTS }
  }
}

export function validateCourseName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length < COURSE_NAME_MIN || trimmed.length > COURSE_NAME_MAX) {
    throw new Error(`Course name must be ${COURSE_NAME_MIN} to ${COURSE_NAME_MAX} characters`)
  }
  return trimmed
}

function validatePrompt(label: string, value: string): string {
  const trimmed = value.trim()
  if (trimmed.length < COURSE_PROMPT_MIN || trimmed.length > COURSE_PROMPT_MAX) {
    throw new Error(`${label} must be ${COURSE_PROMPT_MIN} to ${COURSE_PROMPT_MAX} characters`)
  }
  return trimmed
}

export function validateCoursePrompts(prompts: CoursePrompts): CoursePrompts {
  return {
    improve: validatePrompt("Improve prompt", prompts.improve),
    summary: validatePrompt("Summary prompt", prompts.summary),
    ask: validatePrompt("Ask prompt", prompts.ask)
  }
}

export function parseAppLanguage(value: unknown, fallback: AppLanguage): AppLanguage {
  return value === "en" || value === "fa" ? value : fallback
}

export function fieldsForCreate(
  appLanguage: AppLanguage | null | undefined,
  options?: CourseSettingsInput
): Pick<CourseRecord, "spokenLanguageDefault" | "outputLanguage" | "prompts"> {
  const defaults = defaultCourseFields(appLanguage)
  return {
    spokenLanguageDefault: parseAppLanguage(
      options?.spokenLanguageDefault,
      defaults.spokenLanguageDefault
    ),
    outputLanguage: parseAppLanguage(options?.outputLanguage, defaults.outputLanguage),
    prompts: validateCoursePrompts({ ...defaults.prompts, ...options?.prompts })
  }
}

export function applyCoursePatch(course: CourseRecord, patch: CourseSettingsInput & { name?: string }): CourseRecord {
  const name = patch.name !== undefined ? validateCourseName(patch.name) : course.name
  const spokenLanguageDefault =
    patch.spokenLanguageDefault !== undefined
      ? parseAppLanguage(patch.spokenLanguageDefault, course.spokenLanguageDefault)
      : course.spokenLanguageDefault
  const outputLanguage =
    patch.outputLanguage !== undefined
      ? parseAppLanguage(patch.outputLanguage, course.outputLanguage)
      : course.outputLanguage
  const prompts =
    patch.prompts !== undefined
      ? validateCoursePrompts({ ...course.prompts, ...patch.prompts })
      : course.prompts
  return { ...course, name, spokenLanguageDefault, outputLanguage, prompts }
}

export type LegacyCourseGlobals = {
  appLanguage?: AppLanguage | null
  outputLanguage?: AppLanguage | null
  spokenLanguageDefault?: SpokenLanguage | null
  prompts?: Partial<CoursePrompts> | null
}

export function hydrateCourse(
  raw: {
    id: string
    name: string
    spokenLanguageDefault?: unknown
    outputLanguage?: unknown
    prompts?: unknown
  },
  fallback: LegacyCourseGlobals
): CourseRecord {
  const defaults = defaultCourseFields(fallback.appLanguage)
  const storedPrompts =
    raw.prompts && typeof raw.prompts === "object" ? (raw.prompts as Partial<CoursePrompts>) : null
  const prompts = migratePrompts({
    ...defaults.prompts,
    ...(fallback.prompts ?? {}),
    ...(storedPrompts ?? {})
  })
  return {
    id: raw.id,
    name: raw.name,
    spokenLanguageDefault: parseAppLanguage(
      raw.spokenLanguageDefault ?? fallback.spokenLanguageDefault,
      defaults.spokenLanguageDefault
    ),
    outputLanguage: parseAppLanguage(
      raw.outputLanguage ?? fallback.outputLanguage,
      defaults.outputLanguage
    ),
    prompts
  }
}

export function settingsForCourse(
  state: LibraryState,
  courseId: string | null | undefined
): Pick<CourseRecord, "spokenLanguageDefault" | "outputLanguage" | "prompts"> {
  const course = courseId ? state.courses.find((item) => item.id === courseId) : undefined
  if (course) return course
  return defaultCourseFields(state.appLanguage)
}

export function settingsForVideo(
  state: LibraryState,
  videoId: string
): Pick<CourseRecord, "spokenLanguageDefault" | "outputLanguage" | "prompts"> {
  const video = state.videos.find((item) => item.id === videoId)
  const session = video ? state.sessions.find((item) => item.id === video.sessionId) : undefined
  return settingsForCourse(state, session?.courseId)
}
