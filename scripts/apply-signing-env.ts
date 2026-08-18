import { appendFileSync } from "node:fs"
import { githubEnvFile, omitEmptySigningEnv } from "../src/main/signingEnv.ts"

const dest = process.env.GITHUB_ENV
if (!dest) {
  console.error("GITHUB_ENV is not set")
  process.exit(1)
}

appendFileSync(dest, githubEnvFile(omitEmptySigningEnv(process.env)))
