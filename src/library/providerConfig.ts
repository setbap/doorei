import type {
  ProviderConfig,
  ProviderFieldKind,
  ProviderKind,
  ProviderKindFields,
  ProviderVault
} from "./types.js"

export type { ProviderFieldKind }

const PROVIDER_KINDS: ProviderKind[] = ["openai", "codex", "opencode", "cursor"]

export function providerByKindFromVault(
  vault: ProviderVault
): Record<ProviderKind, ProviderKindFields> {
  return {
    openai: { url: "", key: "", model: "", extra: "", ...vault.openai },
    codex: { url: "", key: "", model: "", extra: "", ...vault.codex },
    opencode: { url: "", key: "", model: "", extra: "", ...vault.opencode },
    cursor: { url: "", key: "", model: "", extra: "", ...vault.cursor }
  }
}

export function providerConfigFromFields(input: {
  kind: ProviderFieldKind
  url?: string
  key?: string
  model?: string
  extra?: string
  byKind?: Partial<Record<ProviderKind, ProviderKindFields>>
}): ProviderConfig | null {
  if (input.kind === "none") return null
  const fields = cleanFields(input.byKind?.[input.kind] ?? input)
  if (input.kind === "openai") {
    if (!fields.url) return null
    return { kind: "openai", ...fields }
  }
  if (input.kind === "cursor" && !fields.key) return null
  return { kind: input.kind, ...omitUrl(fields) }
}

export function providerVaultFromFields(
  byKind: Partial<Record<ProviderKind, ProviderKindFields>>
): ProviderVault {
  const vault: ProviderVault = {}
  for (const kind of PROVIDER_KINDS) {
    const fields = cleanFields(byKind[kind] ?? {})
    if (Object.keys(fields).length > 0) vault[kind] = fields
  }
  return vault
}

function cleanFields(input: ProviderKindFields): ProviderKindFields {
  const fields: ProviderKindFields = {}
  const url = input.url?.trim()
  const key = input.key?.trim()
  const model = input.model?.trim()
  const extra = input.extra?.trim()
  if (url) fields.url = url
  if (key) fields.key = key
  if (model) fields.model = model
  if (extra) fields.extra = extra
  return fields
}

function omitUrl(fields: ProviderKindFields): ProviderKindFields {
  const { url: _url, ...rest } = fields
  return rest
}

