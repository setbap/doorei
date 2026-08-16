import { describe, expect, test } from "vitest"
import { createProviderClient, type ProviderKindClients } from "../../src/adapters/provider.js"
import {
  cursorModelSelection,
  openaiCompleteOptions,
  providerConfigFromFields
} from "../../src/library/providerConfig.js"
import type { Library, ProviderConfig } from "../../src/library/index.js"

function libraryWith(provider: ProviderConfig | null): Library {
  return {
    snapshot: () => ({ provider })
  } as Library
}

function kindClients(): ProviderKindClients {
  return {
    openai: { complete: async () => "from-openai" },
    codex: { complete: async () => "from-codex" },
    opencode: { complete: async () => "from-opencode" },
    cursor: { complete: async () => "from-cursor" }
  }
}

describe("Provider kind routing", () => {
  test("codex kind completes without an OpenAI-compatible URL", async () => {
    const client = createProviderClient(() => libraryWith({ kind: "codex" }), kindClients())
    await expect(client.complete({ system: "sys", prompt: "hello" })).resolves.toBe("from-codex")
  })

  test("opencode kind completes without an OpenAI-compatible URL", async () => {
    const client = createProviderClient(() => libraryWith({ kind: "opencode" }), kindClients())
    await expect(client.complete({ system: "sys", prompt: "hello" })).resolves.toBe("from-opencode")
  })

  test("cursor kind completes without an OpenAI-compatible URL", async () => {
    const client = createProviderClient(
      () => libraryWith({ kind: "cursor", key: "cursor_test" }),
      kindClients()
    )
    await expect(client.complete({ system: "sys", prompt: "hello" })).resolves.toBe("from-cursor")
  })

  test("openai kind keeps the OpenAI-compatible URL client", async () => {
    const client = createProviderClient(
      () => libraryWith({ kind: "openai", url: "http://127.0.0.1:11434/v1", key: "sk" }),
      kindClients()
    )
    await expect(client.complete({ system: "sys", prompt: "hello" })).resolves.toBe("from-openai")
  })

  test("openai kind without a URL fails with a readable error", async () => {
    const client = createProviderClient(() => libraryWith({ kind: "openai" }))
    await expect(client.complete({ system: "sys", prompt: "hello" })).rejects.toThrow(
      "Provider URL is missing"
    )
  })

  test("cursor kind without a key fails with a readable error", async () => {
    const client = createProviderClient(() => libraryWith({ kind: "cursor" }))
    await expect(client.complete({ system: "sys", prompt: "hello" })).rejects.toThrow(
      "Cursor key is missing"
    )
  })
})

describe("Provider fields", () => {
  test("none, OpenAI without a URL, or Cursor without a key is unconfigured", () => {
    expect(providerConfigFromFields({ kind: "none", url: "http://x", key: "k" })).toBeNull()
    expect(providerConfigFromFields({ kind: "openai", url: "  ", key: "k" })).toBeNull()
    expect(providerConfigFromFields({ kind: "cursor", url: "", key: "" })).toBeNull()
  })

  test("openai keeps URL, key, model id, and extra params for the OpenAI-compatible client", () => {
    expect(
      providerConfigFromFields({
        kind: "openai",
        url: " http://127.0.0.1:11434/v1 ",
        key: " sk ",
        model: " llama3.1 ",
        extra: ' {"temperature":0.2} '
      })
    ).toEqual({
      kind: "openai",
      url: "http://127.0.0.1:11434/v1",
      key: "sk",
      model: "llama3.1",
      extra: '{"temperature":0.2}'
    })
  })

  test("editor SDK kinds are stored without stuffing a URL into OpenAI", () => {
    expect(providerConfigFromFields({ kind: "codex", url: "http://x", key: "" })).toEqual({
      kind: "codex"
    })
    expect(providerConfigFromFields({ kind: "opencode", url: "", key: "" })).toEqual({
      kind: "opencode"
    })
    expect(
      providerConfigFromFields({
        kind: "cursor",
        url: "",
        key: " cursor_k ",
        model: " composer-2.5 ",
        extra: ' {"fast":true} '
      })
    ).toEqual({
      kind: "cursor",
      key: "cursor_k",
      model: "composer-2.5",
      extra: '{"fast":true}'
    })
  })

  test("each Provider kind keeps its own key when fields are stored per kind", () => {
    const byKind = {
      openai: { url: "http://127.0.0.1:11434/v1", key: "sk-openai", model: "gpt-4o-mini" },
      cursor: { key: "cursor_k", model: "composer-2.5", extra: '{"fast":true}' }
    }
    expect(providerConfigFromFields({ kind: "openai", url: "", key: "", byKind })).toEqual({
      kind: "openai",
      url: "http://127.0.0.1:11434/v1",
      key: "sk-openai",
      model: "gpt-4o-mini"
    })
    expect(providerConfigFromFields({ kind: "cursor", url: "", key: "", byKind })).toEqual({
      kind: "cursor",
      key: "cursor_k",
      model: "composer-2.5",
      extra: '{"fast":true}'
    })
  })
})

describe("Provider model selection", () => {
  test("OpenAI-compatible uses the written model id and extra params", () => {
    expect(
      openaiCompleteOptions({
        kind: "openai",
        url: "http://x/v1",
        model: "qwen2.5",
        extra: '{"temperature":0.1,"max_tokens":2048,"reasoning_effort":"low"}'
      })
    ).toEqual({
      modelId: "qwen2.5",
      temperature: 0.1,
      maxOutputTokens: 2048,
      providerOptions: { openai: { reasoning_effort: "low" } }
    })
  })

  test("OpenAI-compatible falls back to gpt-4o-mini when no model id is written", () => {
    expect(openaiCompleteOptions({ kind: "openai", url: "http://x/v1" }).modelId).toBe("gpt-4o-mini")
  })

  test("Cursor uses the written model id and params such as fast", () => {
    expect(
      cursorModelSelection({
        kind: "cursor",
        key: "k",
        model: "composer-2.5",
        extra: '{"fast":true}'
      })
    ).toEqual({
      id: "composer-2.5",
      params: [{ id: "fast", value: "true" }]
    })
  })

  test("Cursor without a model id uses composer-2.5 in fast mode", () => {
    expect(cursorModelSelection({ kind: "cursor", key: "k" })).toEqual({
      id: "composer-2.5",
      params: [{ id: "fast", value: "true" }]
    })
  })
})
