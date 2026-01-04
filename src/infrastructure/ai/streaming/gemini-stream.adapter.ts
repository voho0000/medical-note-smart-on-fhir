// Gemini Streaming Adapter
import { ENV_CONFIG } from "@/src/shared/config/env.config"
import { getModelDefinition } from "@/src/shared/constants/ai-models.constants"
import type { StreamConfig } from "./openai-stream.adapter"

export class GeminiStreamAdapter {
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
    if (!ENV_CONFIG.hasGeminiProxy) return false
    
    // Check if model is available via proxy (doesn't require user key)
    const modelDef = getModelDefinition(model)
    return !modelDef?.requiresUserKey
  }

  private convertToGeminiFormat(messages: { role: string; content: string }[]) {
    const systemPrompt = messages.find((m) => m.role === "system")?.content
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }))

    return { systemPrompt, contents }
  }

  private async streamViaProxy(config: StreamConfig): Promise<void> {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (ENV_CONFIG.proxyClientKey) {
      headers["x-proxy-key"] = ENV_CONFIG.proxyClientKey
    }

    // Firebase proxy expects simple messages format, not Gemini native format
    const res = await fetch(ENV_CONFIG.geminiProxyUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        messages: config.messages,
      }),
      signal: config.signal,
    })

    if (!res.ok) {
      const errorText = await res.text()
      try {
        const errorData = JSON.parse(errorText)
        throw new Error(errorData.error?.message || errorData.error || "Gemini proxy request failed")
      } catch {
        throw new Error(`Gemini proxy request failed: ${res.status} ${errorText}`)
      }
    }

    const data = await res.json()
    const text = data.message || data.text || data.candidates?.[0]?.content?.parts?.[0]?.text || ""
    config.onChunk(text)
  }

  private async streamDirect(config: StreamConfig): Promise<void> {
    if (!config.apiKey) {
      throw new Error("Gemini API key required")
    }

    const { systemPrompt, contents } = this.convertToGeminiFormat(config.messages)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:streamGenerateContent?key=${config.apiKey}&alt=sse`

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
      }),
      signal: config.signal,
    })

    if (!res.ok) {
      throw new Error("Gemini request failed")
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
        if (line.startsWith("data: ")) {
          try {
            const text = JSON.parse(line.slice(6)).candidates?.[0]?.content?.parts?.[0]?.text
            if (text) {
              content += text
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
