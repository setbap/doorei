import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { planReleaseVersion } from "../src/main/releaseVersion.ts"

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const PACKAGE_JSON = join(ROOT, "package.json")

function git(args: string[]): string {
  const result = spawnSync("git", args, { encoding: "utf8", cwd: ROOT })
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `git ${args.join(" ")} failed`).trim())
  }
  return result.stdout
}

const versionArg = process.argv[2]
if (!versionArg) {
  console.error("usage: pnpm release <version>")
  process.exit(1)
}

const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).trim()
if (branch !== "master") {
  console.error(`Releases must be tagged on master (current branch: ${branch})`)
  process.exit(1)
}

const dirty = git(["status", "--porcelain"]).trim()
if (dirty !== "") {
  console.error("Working tree must be clean before tagging a release")
  process.exit(1)
}

const plan = planReleaseVersion({
  packageJson: readFileSync(PACKAGE_JSON, "utf8"),
  version: versionArg
})

const existing = spawnSync("git", ["rev-parse", "-q", "--verify", `refs/tags/${plan.tag}`], {
  encoding: "utf8",
  cwd: ROOT
})
if (existing.status === 0) {
  console.error(`Tag ${plan.tag} already exists`)
  process.exit(1)
}

writeFileSync(PACKAGE_JSON, plan.packageJson)
git(["add", "package.json"])
git(["commit", "-m", `Bump the app version to ${plan.version} for the next GitHub Release.`])
git(["tag", plan.tag])
git(["push", "origin", "HEAD"])
git(["push", "origin", plan.tag])
console.log(`Pushed ${plan.tag}`)
