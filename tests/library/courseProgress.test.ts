import { describe, expect, test } from "vitest"
import { courseWatchProgress } from "../../src/library/courseProgress.js"

describe("Course watch progress", () => {
  test("label is watched over total and percent with one decimal", () => {
    const videos = [
      ...Array.from({ length: 20 }, () => ({ watched: true })),
      { watched: false }
    ]
    expect(courseWatchProgress(videos)).toEqual({
      watched: 20,
      total: 21,
      percent: 95.2,
      label: "(20/21) 95.2%"
    })
  })

  test("an empty Course is 0.0%", () => {
    expect(courseWatchProgress([])).toEqual({
      watched: 0,
      total: 0,
      percent: 0,
      label: "(0/0) 0.0%"
    })
  })
})
