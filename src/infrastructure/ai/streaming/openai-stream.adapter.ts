// OpenAI Streaming Adapter
import { ENV_CONFIG } from "@/src/shared/config/env.config"
import { getModelDefinition } from "@/src/shared/constants/ai-models.constants"

export interface StreamConfig {
  messages: { role: string; content: string }[]
  model: string
  apiKey: string | null
  signal: AbortSignal
  onChunk: (content: string) => void
}

export class OpenAiStreamAdapter {
  async stream(config: StreamConfig): Promise<void> {
    const useProxy = this.shouldUseProxy(config.apiKey, config.model)
    
    if (useProxy) {
      await this.streamViaProxy(config)
    } else {
      await this.streamDirect(config)
    }
  }

  private shouldUseProxy(apiKey: string | null, model: string): boolean {
    if (apiKey) return false
    if (!ENV_CONFIG.hasChatProxy) return false
    
    // Check if model is available via proxy (doesn't require user key)
    const modelDef = getModelDefinition(model)
    return !modelDef?.requiresUserKey
  }

  private async streamViaProxy(config: StreamConfig): Promise<void> {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (ENV_CONFIG.proxyClientKey) {
      headers["x-proxy-key"] = ENV_CONFIG.proxyClientKey
    }

    const res = await fetch(ENV_CONFIG.chatProxyUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ 
        model: config.model, 
        messages: config.messages, 
        stream: false 
      }),
      signal: config.signal,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error?.message || err.error || "OpenAI proxy request failed")
    }

    const data = await res.json()
    const content = data.message || data.choices?.[0]?.message?.content || ""
    config.onChunk(content)
  }

  private async streamDirect(config: StreamConfig): Promise<void> {
    if (!config.apiKey) {
      throw new Error("OpenAI API key required")
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ 
        model: config.model, 
        messages: config.messages, 
        stream: true 
      }),
      signal: config.signal,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error?.message || "OpenAI request failed")
    }

    await this.processStreamResponse(res, config.onChunk)
  }

  private async processStreamResponse(
    response: Response, 
    onChunk: (content: string) => void
  ): Promise<void> {
    const reader = response.body?.getReader()
    if (!reader) throw new Error("No response body")

    const decoder = new TextDecoder()
    let content = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      for (const line of decoder.decode(value, { stream: true }).split("\n")) {
        if (line.startsWith("data: ") && line !== "data: [DONE]") {
          try {
            const delta = JSON.parse(line.slice(6)).choices?.[0]?.delta?.content
            if (delta) {
              content += delta
              onChunk(content)
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }
}
