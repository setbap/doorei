import { createOpenAI } from "@ai-sdk/openai"
import { generateText } from "ai"
import type { Library, ProviderClient } from "../library/index.js"

export function createProviderClient(getLibrary: () => Library): ProviderClient {
  return {
    async complete({ system, prompt }) {
      const config = getLibrary().snapshot().provider
      if (!config?.url) {
        throw new Error("Provider URL is missing")
      }
      const openai = createOpenAI({
        baseURL: config.url,
        apiKey: config.key || "not-needed"
      })
      const { text } = await generateText({
        model: openai.chat("gpt-4o-mini"),
        system,
        prompt
      })
      return text
    }
  }
}
