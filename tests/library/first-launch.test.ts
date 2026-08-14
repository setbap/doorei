import { describe, expect, test } from "vitest"
import { REQUIRED_MODELS } from "../../src/library/index.js"
import { createTestLibrary } from "./helpers.js"

describe("first launch", () => {
  test("Library stays unusable until App language is chosen and every required model is on disk", async () => {
    const { library, modelStore } = createTestLibrary()

    expect(library.snapshot().usable).toBe(false)

    await library.chooseAppLanguage("fa")
    expect(library.snapshot().usable).toBe(false)
    expect(library.snapshot().appLanguage).toBe("fa")
    expect(library.snapshot().direction).toBe("rtl")

    modelStore.markComplete(REQUIRED_MODELS.shenava)
    modelStore.markComplete(REQUIRED_MODELS.parakeet)
    expect(library.snapshot().usable).toBe(false)

    modelStore.markComplete(REQUIRED_MODELS.embedding)
    expect(library.snapshot().usable).toBe(true)
  })

  test("Persian is the default App language direction before a choice is stored", () => {
    const { library } = createTestLibrary()
    expect(library.snapshot().appLanguage).toBeNull()
    expect(library.snapshot().direction).toBe("rtl")
  })

  test("English App language is LTR", async () => {
    const { library, modelStore } = createTestLibrary()
    modelStore.markAllRequired()
    await library.chooseAppLanguage("en")
    expect(library.snapshot().direction).toBe("ltr")
    expect(library.snapshot().usable).toBe(true)
  })

  test("Library unlocks without a Provider", async () => {
    const { library, modelStore } = createTestLibrary()
    modelStore.markAllRequired()
    await library.chooseAppLanguage("fa")
    expect(library.snapshot().providerConfigured).toBe(false)
    expect(library.snapshot().usable).toBe(true)
  })

  test("optional Provider can be stored on the gate without being required", async () => {
    const { library, modelStore } = createTestLibrary()
    modelStore.markAllRequired()
    await library.configureProvider({
      kind: "openai",
      url: "http://127.0.0.1:11434/v1",
      key: "sk-test"
    })
    await library.chooseAppLanguage("fa")
    expect(library.snapshot().providerConfigured).toBe(true)
    expect(library.snapshot().usable).toBe(true)
  })

  test("required model ids are Shenava, Parakeet, and multilingual-e5-small", () => {
    expect(REQUIRED_MODELS.shenava).toBe("Reza2kn/Shenava-Koochik-v1.0-ONNX-fp16")
    expect(REQUIRED_MODELS.parakeet).toBe("istupakov/parakeet-tdt-0.6b-v3-onnx")
    expect(REQUIRED_MODELS.embedding).toBe("intfloat/multilingual-e5-small")
  })
})
