import type {
  ProviderConfig,
  ProviderKind,
  ProviderKindFields,
  ProviderVault
} from "./types.js"

export type ProviderFieldKind = ProviderKind | "none"

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

export function openaiCompleteOptions(config: ProviderConfig): {
  modelId: string
  temperature?: number
  maxOutputTokens?: number
  topP?: number
  seed?: number
  providerOptions?: { openai: Record<string, string | number | boolean | null> }
} {
  const extra = parseProviderExtra(config.extra)
  const {
    temperature,
    maxOutputTokens,
    max_tokens,
    topP,
    top_p,
    seed,
    ...rest
  } = extra
  const openai = jsonRecord(rest)
  return {
    modelId: config.model?.trim() || "gpt-4o-mini",
    ...numberOption("temperature", temperature),
    ...numberOption("maxOutputTokens", maxOutputTokens ?? max_tokens),
    ...numberOption("topP", topP ?? top_p),
    ...numberOption("seed", seed),
    ...(Object.keys(openai).length > 0 ? { providerOptions: { openai } } : {})
  }
}

export function cursorModelSelection(config: ProviderConfig): {
  id: string
  params?: { id: string; value: string }[]
} {
  const written = config.model?.trim()
  const extra = parseProviderExtra(config.extra)
  const params = Object.entries(extra).map(([id, value]) => ({
    id,
    value: extraValue(value)
  }))
  if (params.length === 0 && !written) {
    params.push({ id: "fast", value: "true" })
  }
  return params.length > 0 ? { id: written || "composer-2.5", params } : { id: written || "composer-2.5" }
}

export function parseProviderExtra(extra: string | undefined): Record<string, unknown> {
  const trimmed = extra?.trim()
  if (!trimmed) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error("Provider extra is not valid JSON")
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Provider extra must be a JSON object")
  }
  return parsed as Record<string, unknown>
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

function numberOption<K extends string>(
  key: K,
  value: unknown
): Partial<Record<K, number>> {
  if (value === undefined || value === null || value === "") return {}
  const n = Number(value)
  return Number.isFinite(n) ? ({ [key]: n } as Partial<Record<K, number>>) : {}
}

function extraValue(value: unknown): string {
  if (typeof value === "string") return value
  if (typeof value === "boolean" || typeof value === "number") return String(value)
  return JSON.stringify(value)
}

function jsonRecord(value: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean" || item === null) {
      out[key] = item
    }
  }
  return out
}
