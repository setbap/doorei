export type ReleaseVersionPlan = {
  version: string
  tag: string
  packageJson: string
}

const RELEASE_VERSION = /^\d+\.\d+\.\d+$/

export function parseReleaseVersion(input: string): string {
  const version = input.trim().replace(/^v/, "")
  if (!RELEASE_VERSION.test(version)) {
    throw new Error(`Release version must be X.Y.Z (got ${JSON.stringify(input)})`)
  }
  return version
}

export function planReleaseVersion(input: {
  packageJson: string
  version: string
}): ReleaseVersionPlan {
  const version = parseReleaseVersion(input.version)
  const pkg = JSON.parse(input.packageJson) as { version?: unknown }
  if (pkg.version === version) {
    throw new Error(`package.json is already ${version}`)
  }
  pkg.version = version
  return {
    version,
    tag: `v${version}`,
    packageJson: `${JSON.stringify(pkg, null, 2)}\n`
  }
}
