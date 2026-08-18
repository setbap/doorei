import { describe, expect, test } from "vitest"
import { planReleaseVersion } from "../../src/main/releaseVersion.js"

const packageJson = `{
  "name": "doorei",
  "version": "0.1.0",
  "private": true
}
`

describe("planReleaseVersion", () => {
  test("writes the package version and the v-prefixed GitHub tag the release workflow expects", () => {
    const plan = planReleaseVersion({ packageJson, version: "0.2.1" })
    expect(plan.version).toBe("0.2.1")
    expect(plan.tag).toBe("v0.2.1")
    expect(JSON.parse(plan.packageJson)).toEqual({
      name: "doorei",
      version: "0.2.1",
      private: true
    })
    expect(plan.packageJson.endsWith("\n")).toBe(true)
  })

  test("accepts a v prefix so a GitHub tag name can be passed through", () => {
    expect(planReleaseVersion({ packageJson, version: "v0.2.1" }).tag).toBe("v0.2.1")
  })

  test("rejects a version that is not X.Y.Z", () => {
    expect(() => planReleaseVersion({ packageJson, version: "latest" })).toThrow(
      'Release version must be X.Y.Z (got "latest")'
    )
  })

  test("refuses to retag the version already in package.json", () => {
    expect(() => planReleaseVersion({ packageJson, version: "0.1.0" })).toThrow(
      "package.json is already 0.1.0"
    )
  })
})
