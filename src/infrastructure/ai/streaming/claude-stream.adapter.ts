// Claude Streaming Adapter — AI-SDK-backed (audit C6 direction).
//
// Unlike the OpenAI/Gemini adapters (hand-rolled SSE, slated for migration),
// Claude rides the Vercel AI SDK from day one: this class only adapts the
// app's StreamConfig contract onto streamText(). Proxy-vs-direct routing and
// the Firebase ID token live in AiProviderFactory / the fetch interceptor.

import { streamText, type ModelMessage } from "ai"
import { ENV_CONFIG } from "@/src/shared/config/env.config"
import { getModelDefinition } from "@/src/shared/constants/ai-models.constants"
import { aiProviderFactory } from "../factories/ai-provider.factory"
import type { StreamConfig } from "./openai-stream.adapter"

export class ClaudeStreamAdapter {
  async stream(config: StreamConfig): Promise<void> {
    const useProxy = this.shouldUseProxy(config.apiKey, config.model)
    const { model } = aiProviderFactory.create({
      modelId: config.model,
      apiKey: config.apiKey ?? undefined,
      useProxy,
    })

    const result = streamText({
      model,
      messages: this.toSdkMessages(config.messages),
      abortSignal: config.signal,
    })

    // StreamConfig.onChunk receives the CUMULATIVE text (matches the other adapters)
    let fullText = ""
    for await (const delta of result.textStream) {
      fullText += delta
      config.onChunk(fullText)
    }
  }

  private shouldUseProxy(apiKey: string | null, model: string): boolean {
    if (apiKey) return false
    if (!ENV_CONFIG.hasClaudeProxy) return false
    const modelDef = getModelDefinition(model)
    return !modelDef?.requiresUserKey
  }

  private toSdkMessages(messages: StreamConfig["messages"]): ModelMessage[] {
    return messages.map((m): ModelMessage => {
      if (m.role === "system") {
        return { role: "system", content: m.content }
      }
      if (m.role === "assistant") {
        return { role: "assistant", content: m.content }
      }
      // user message — images ride along as multimodal parts
      if (m.images && m.images.length > 0) {
        return {
          role: "user",
          content: [
            ...(m.content ? [{ type: "text" as const, text: m.content }] : []),
            ...m.images.map((img: { data: string }) => ({
              type: "image" as const,
              image: img.data, // base64 data URL — the SDK handles the conversion
            })),
          ],
        }
      }
      return { role: "user", content: m.content }
    })
  }
}
