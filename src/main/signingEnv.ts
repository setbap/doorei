export const SIGNING_ENV_NAMES = [
  "CSC_LINK",
  "CSC_KEY_PASSWORD",
  "WIN_CSC_LINK",
  "WIN_CSC_KEY_PASSWORD",
  "APPLE_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
  "APPLE_TEAM_ID"
] as const

export type SigningEnvName = (typeof SIGNING_ENV_NAMES)[number]

export function omitEmptySigningEnv(
  env: Record<string, string | undefined>
): Partial<Record<SigningEnvName, string>> {
  const out: Partial<Record<SigningEnvName, string>> = {}
  for (const name of SIGNING_ENV_NAMES) {
    const value = env[name]
    if (value != null && value.trim() !== "") out[name] = value
  }
  return out
}

export function githubEnvFile(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([name, value]) => `${name}<<EOF\n${value}\nEOF\n`)
    .join("")
}
