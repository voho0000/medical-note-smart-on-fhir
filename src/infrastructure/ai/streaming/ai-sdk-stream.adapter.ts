// Unified streaming adapter (audit C6).
//
// One AI-SDK-backed adapter for ALL providers, replacing the three
// hand-rolled SSE adapters (OpenAI/Gemini parsed proxy responses by hand;
// Claude already rode the SDK). Proxy-vs-direct routing and the Firebase ID
// token live in AiProviderFactory / the fetch interceptor; every proxy now
// forwards the SDK's native body verbatim (passthrough), so chat and agent
// mode share one path.

import { streamText, type ModelMessage } from "ai"
import { ENV_CONFIG } from "@/src/shared/config/env.config"
import { getModelDefinition } from "@/src/shared/constants/ai-models.constants"
import { aiProviderFactory } from "../factories/ai-provider.factory"
import { withIdleTimeout, resolveStreamIdleTimeoutMs } from "./stream-idle-timeout"

export interface StreamConfig {
  messages: { role: string; content: string; images?: { data: string }[] }[]
  model: string
  apiKey: string | null
  signal: AbortSignal
  onChunk: (content: string) => void
}

export class AiSdkStreamAdapter {
  async stream(config: StreamConfig): Promise<void> {
    const useProxy = this.shouldUseProxy(config.apiKey, config.model)
    const { model } = aiProviderFactory.create({
      modelId: config.model,
      apiKey: config.apiKey ?? undefined,
      useProxy,
    })

    // Drive the SDK off our OWN controller so the idle watchdog can abort a
    // stalled stream independently of the user's stop (config.signal).
    const controller = new AbortController()
    const onExternalAbort = () => controller.abort()
    if (config.signal.aborted) controller.abort()
    else config.signal.addEventListener("abort", onExternalAbort, { once: true })

    // The AI SDK does NOT throw request/stream errors out of `textStream`; it
    // forwards them to `onError` (whose default just console.errors) and then
    // ends the stream. Without capturing here, a failed call (e.g. a proxy 401
    // when the user isn't signed in) would end silently → empty output, no error
    // surfaced ("spinner for a second, then nothing"). Capture it and rethrow
    // after the loop so callers can show a real error.
    let streamError: unknown = null
    const result = streamText({
      model,
      messages: this.toSdkMessages(config.messages),
      abortSignal: controller.signal,
      onError: ({ error }) => { streamError = error },
    })

    // withIdleTimeout aborts + throws StreamIdleTimeoutError if no token arrives
    // for streamIdleTimeoutMs — so a stalled upstream surfaces a timeout error
    // (getUserErrorMessage maps it) instead of hanging the UI forever.
    let fullText = ""
    try {
      for await (const delta of withIdleTimeout(
        result.textStream,
        resolveStreamIdleTimeoutMs(),
        () => controller.abort(),
      )) {
        fullText += delta
        config.onChunk(fullText)
      }
    } catch (error) {
      // User pressed stop → end cleanly (the old adapters swallowed abort too).
      // A StreamIdleTimeoutError is NOT a user abort, so it propagates.
      if (config.signal.aborted) return
      throw error
    } finally {
      config.signal.removeEventListener("abort", onExternalAbort)
    }

    // Surface an error the SDK reported via onError (the textStream itself ended
    // without throwing). Aborts are intentional and stay silent.
    if (streamError && !config.signal.aborted) {
      throw streamError
    }
  }

  private shouldUseProxy(apiKey: string | null, model: string): boolean {
    if (apiKey) return false
    const provider = getModelDefinition(model)?.provider ?? "openai"
    const hasProxy =
      provider === "gemini" ? ENV_CONFIG.hasGeminiProxy :
      provider === "claude" ? ENV_CONFIG.hasClaudeProxy :
      ENV_CONFIG.hasChatProxy
    if (!hasProxy) return false
    return !getModelDefinition(model)?.requiresUserKey
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
            ...m.images.map((img) => ({
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

export const aiSdkStreamAdapter = new AiSdkStreamAdapter()
