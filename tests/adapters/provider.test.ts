import { describe, expect, test } from "vitest"
import { createProviderClient, type ProviderKindClients } from "../../src/adapters/provider.js"
import { providerConfigFromFields } from "../../src/library/providerConfig.js"
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

  test("openai keeps URL and key for the OpenAI-compatible client", () => {
    expect(
      providerConfigFromFields({ kind: "openai", url: " http://127.0.0.1:11434/v1 ", key: " sk " })
    ).toEqual({
      kind: "openai",
      url: "http://127.0.0.1:11434/v1",
      key: "sk"
    })
  })

  test("editor SDK kinds are stored without stuffing a URL into OpenAI", () => {
    expect(providerConfigFromFields({ kind: "codex", url: "http://x", key: "" })).toEqual({
      kind: "codex"
    })
    expect(providerConfigFromFields({ kind: "opencode", url: "", key: "" })).toEqual({
      kind: "opencode"
    })
    expect(providerConfigFromFields({ kind: "cursor", url: "", key: " cursor_k " })).toEqual({
      kind: "cursor",
      key: "cursor_k"
    })
  })
})
