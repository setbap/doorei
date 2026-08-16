import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createOpenAI } from "@ai-sdk/openai"
import { generateText } from "ai"
import type { Library, ProviderClient, ProviderConfig } from "../library/index.js"

export type ProviderCompleteInput = { system: string; prompt: string }

export type ProviderKindClient = {
  complete(config: ProviderConfig, input: ProviderCompleteInput): Promise<string>
}

export type ProviderKindClients = {
  openai: ProviderKindClient
  codex: ProviderKindClient
  opencode: ProviderKindClient
  cursor: ProviderKindClient
}

async function completeOpenAI(
  config: ProviderConfig,
  input: ProviderCompleteInput
): Promise<string> {
  if (!config.url) {
    throw new Error("Provider URL is missing")
  }
  const openai = createOpenAI({
    baseURL: config.url,
    apiKey: config.key || "not-needed"
  })
  const options = openaiCompleteOptions(config)
  const { text } = await generateText({
    model: openai.chat(options.modelId),
    system: input.system,
    prompt: input.prompt,
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    ...(options.maxOutputTokens !== undefined ? { maxOutputTokens: options.maxOutputTokens } : {}),
    ...(options.topP !== undefined ? { topP: options.topP } : {}),
    ...(options.seed !== undefined ? { seed: options.seed } : {}),
    ...(options.providerOptions ? { providerOptions: options.providerOptions } : {})
  })
  return text
}

const defaultProviderKindClients: ProviderKindClients = {
  openai: { complete: completeOpenAI },
  codex: { complete: completeCodex },
  opencode: { complete: completeOpenCode },
  cursor: { complete: completeCursor }
}

export function createProviderClient(
  getLibrary: () => Library,
  kindClients: ProviderKindClients = defaultProviderKindClients
): ProviderClient {
  return {
    async complete(input) {
      const config = getLibrary().snapshot().provider
      if (!config) {
        throw new Error("Provider is not configured")
      }
      return kindClients[config.kind].complete(config, input)
    }
  }
}

function promptWithSystem(input: ProviderCompleteInput): string {
  return `${input.system}\n\n${input.prompt}`
}

async function withTempDir<T>(prefix: string, run: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  try {
    return await run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function completeCodex(
  config: ProviderConfig,
  input: ProviderCompleteInput
): Promise<string> {
  return withTempDir("doorei-codex-", async (workingDirectory) => {
    const { Codex } = await import("@openai/codex-sdk")
    const codex = new Codex(config.key ? { apiKey: config.key } : undefined)
    const thread = codex.startThread({
      workingDirectory,
      skipGitRepoCheck: true,
      sandboxMode: "read-only",
      approvalPolicy: "never",
      networkAccessEnabled: false,
      ...(config.model?.trim() ? { model: config.model.trim() } : {})
    })
    const turn = await thread.run(promptWithSystem(input))
    if (!turn.finalResponse) {
      throw new Error("Codex returned an empty response")
    }
    return turn.finalResponse
  })
}

async function completeOpenCode(
  _config: ProviderConfig,
  input: ProviderCompleteInput
): Promise<string> {
  const { createOpencode } = await import("@opencode-ai/sdk")
  const opencode = await createOpencode({ hostname: "127.0.0.1", port: 0 })
  try {
    const session = await opencode.client.session.create({
      body: { title: "Doorei" },
      throwOnError: true
    })
    const result = await opencode.client.session.prompt({
      path: { id: session.data.id },
      body: { parts: [{ type: "text", text: promptWithSystem(input) }] },
      throwOnError: true
    })
    const text = result.data.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("")
    if (!text) {
      throw new Error("OpenCode returned an empty response")
    }
    return text
  } finally {
    opencode.server.close()
  }
}

async function completeCursor(
  config: ProviderConfig,
  input: ProviderCompleteInput
): Promise<string> {
  if (!config.key) {
    throw new Error("Cursor key is missing")
  }
  return withTempDir("doorei-cursor-", async (cwd) => {
    const { Agent } = await import("@cursor/sdk")
    const result = await Agent.prompt(promptWithSystem(input), {
      apiKey: config.key,
      model: cursorModelSelection(config),
      tools: [],
      local: { cwd, settingSources: [] }
    })
    if (result.status !== "finished") {
      throw new Error(result.error?.message ?? "Cursor Provider failed")
    }
    if (!result.result) {
      throw new Error("Cursor returned an empty response")
    }
    return result.result
  })
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
  return params.length > 0
    ? { id: written || "composer-2.5", params }
    : { id: written || "composer-2.5" }
}

function parseProviderExtra(extra: string | undefined): Record<string, unknown> {
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

function jsonRecord(
  value: Record<string, unknown>
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {}
  for (const [key, item] of Object.entries(value)) {
    if (
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean" ||
      item === null
    ) {
      out[key] = item
    }
  }
  return out
}

