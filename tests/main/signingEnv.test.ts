import { describe, expect, test } from "vitest"
import { githubEnvFile, omitEmptySigningEnv } from "../../src/main/signingEnv.js"

describe("omitEmptySigningEnv", () => {
  test("does not export empty GitHub secret strings as a certificate path", () => {
    expect(
      omitEmptySigningEnv({
        CSC_LINK: "",
        CSC_KEY_PASSWORD: "   ",
        WIN_CSC_LINK: undefined
      })
    ).toEqual({})
  })

  test("keeps a real certificate link for electron-builder", () => {
    expect(
      omitEmptySigningEnv({
        CSC_LINK: "certs/dev-id.p12",
        CSC_KEY_PASSWORD: "secret",
        APPLE_TEAM_ID: ""
      })
    ).toEqual({
      CSC_LINK: "certs/dev-id.p12",
      CSC_KEY_PASSWORD: "secret"
    })
  })
})

describe("githubEnvFile", () => {
  test("writes heredoc blocks GitHub Actions can source", () => {
    expect(githubEnvFile({ CSC_LINK: "certs/dev-id.p12" })).toBe("CSC_LINK<<EOF\ncerts/dev-id.p12\nEOF\n")
  })
})
