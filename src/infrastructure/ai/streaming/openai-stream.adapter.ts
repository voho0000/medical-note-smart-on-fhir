// OpenAI Streaming Adapter
import { ENV_CONFIG } from "@/src/shared/config/env.config"
import { getModelDefinition } from "@/src/shared/constants/ai-models.constants"

export interface StreamConfig {
  messages: { role: string; content: string; images?: any[] }[]
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
        messages: config.messages, // Messages now include images field
        stream: true  // Enable streaming
      }),
      signal: config.signal,
    })


    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error?.message || err.error || "OpenAI proxy request failed")
    }

    // Process Vercel AI SDK data stream format
    await this.processDataStreamResponse(res, config.onChunk)
  }

  private async streamDirect(config: StreamConfig): Promise<void> {
    if (!config.apiKey) {
      throw new Error("OpenAI API key required")
    }

    // Transform messages with images to OpenAI Vision API format
    const apiMessages = config.messages.map(msg => {
      // If message has images, use multimodal content format
      if (msg.images && msg.images.length > 0) {
        return {
          role: msg.role,
          content: [
            { type: 'text', text: msg.content },
            ...msg.images.map(img => ({
              type: 'image_url',
              image_url: { url: img.data }
            }))
          ]
        }
      }
      // Text-only messages
      return {
        role: msg.role,
        content: msg.content
      }
    })

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ 
        model: config.model, 
        messages: apiMessages, 
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

  private async processDataStreamResponse(
    response: Response,
    onChunk: (content: string) => void
  ): Promise<void> {
    const reader = response.body?.getReader()
    if (!reader) throw new Error("No response body")

    const decoder = new TextDecoder()
    let buffer = ""
    let content = ""
    let chunkCount = 0
    let textChunkCount = 0

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }

        chunkCount++
        const decoded = decoder.decode(value, { stream: true })
        buffer += decoded

        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (!line.trim()) continue

          // OpenAI native SSE format: "data: {"choices":[...]}"
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const jsonStr = line.slice(6) // Remove "data: " prefix
              const data = JSON.parse(jsonStr)
              const delta = data.choices?.[0]?.delta?.content
              if (delta) {
                content += delta
                textChunkCount++
                onChunk(content)
              }
            } catch (e) {
              console.warn("[OpenAI Stream] Failed to parse OpenAI chunk", {
                line: line.substring(0, 100),
                error: e instanceof Error ? e.message : String(e),
              })
            }
          } else if (line.startsWith("0:")) {
            // Legacy Vercel AI SDK data stream format: "0:\"text\"\n"
            try {
              const text = JSON.parse(line.slice(2))
              content += text
              textChunkCount++
              onChunk(content)
            } catch (e) {
              console.warn("[OpenAI Stream] Failed to parse text chunk", {
                line: line.substring(0, 100),
                error: e instanceof Error ? e.message : String(e),
              })
            }
          } else if (line === "data: [DONE]") {
            // OpenAI stream end marker
          }
        }
      }
    } catch (error) {
      // Most errors during streaming are abort errors from user clicking stop
      // Return gracefully instead of throwing
      return
    }
  }
}
