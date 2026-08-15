import type { ProviderConfig, ProviderKind } from "./types.js"

export type ProviderFieldKind = ProviderKind | "none"

export function providerConfigFromFields(input: {
  kind: ProviderFieldKind
  url: string
  key: string
}): ProviderConfig | null {
  if (input.kind === "none") return null
  const url = input.url.trim()
  const key = input.key.trim()
  if (input.kind === "openai") {
    if (!url) return null
    return key ? { kind: "openai", url, key } : { kind: "openai", url }
  }
  if (input.kind === "cursor" && !key) return null
  return key ? { kind: input.kind, key } : { kind: input.kind }
}
