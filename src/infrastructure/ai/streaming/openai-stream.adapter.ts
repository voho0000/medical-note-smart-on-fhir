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
    
    console.log("[OpenAI Adapter] Stream method called", {
      model: config.model,
      hasApiKey: !!config.apiKey,
      useProxy,
      hasChatProxy: ENV_CONFIG.hasChatProxy,
      chatProxyUrl: ENV_CONFIG.chatProxyUrl,
    })
    
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

    console.log("[OpenAI Proxy] Starting streaming request", {
      url: ENV_CONFIG.chatProxyUrl,
      model: config.model,
      messageCount: config.messages.length,
    })

    const res = await fetch(ENV_CONFIG.chatProxyUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ 
        model: config.model, 
        messages: config.messages, 
        stream: true  // Enable streaming
      }),
      signal: config.signal,
    })

    console.log("[OpenAI Proxy] Response received", {
      status: res.status,
      contentType: res.headers.get("content-type"),
      hasBody: !!res.body,
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

  private async processDataStreamResponse(
    response: Response,
    onChunk: (content: string) => void
  ): Promise<void> {
    const reader = response.body?.getReader()
    if (!reader) throw new Error("No response body")

    console.log("[OpenAI Stream] Starting to read stream...")

    const decoder = new TextDecoder()
    let buffer = ""
    let content = ""
    let chunkCount = 0
    let textChunkCount = 0

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          console.log("[OpenAI Stream] Stream completed", {
            totalChunks: chunkCount,
            textChunks: textChunkCount,
            finalLength: content.length,
          })
          break
        }

        chunkCount++
        const decoded = decoder.decode(value, { stream: true })
        buffer += decoded

        if (chunkCount === 1) {
          console.log("[OpenAI Stream] First chunk received", {
            length: decoded.length,
            preview: decoded.substring(0, 100),
          })
        }

        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (!line.trim()) continue

          // Vercel AI SDK data stream format: "0:\"text\"\n" or "d:{...}\n"
          if (line.startsWith("0:")) {
            try {
              const text = JSON.parse(line.slice(2))
              content += text
              textChunkCount++
              onChunk(content)
              
              if (textChunkCount === 1) {
                console.log("[OpenAI Stream] First text chunk parsed", {
                  text: text.substring(0, 50),
                })
              }
            } catch (e) {
              console.warn("[OpenAI Stream] Failed to parse text chunk", {
                line: line.substring(0, 100),
                error: e instanceof Error ? e.message : String(e),
              })
            }
          } else if (line.startsWith("d:")) {
            try {
              const data = JSON.parse(line.slice(2))
              console.log("[OpenAI Stream] Finish reason:", data.finishReason)
            } catch (e) {
              console.warn("[OpenAI Stream] Failed to parse finish data", {
                line: line.substring(0, 100),
                error: e instanceof Error ? e.message : String(e),
              })
            }
          } else {
            console.log("[OpenAI Stream] Unknown line format", {
              prefix: line.substring(0, 20),
            })
          }
        }
      }
    } catch (error) {
      // Most errors during streaming are abort errors from user clicking stop
      // Just log and return gracefully instead of throwing
      console.log("[OpenAI Stream] Stream interrupted", {
        chunkCount,
        textChunkCount,
      })
      // Don't throw - return gracefully
      return
    }
  }
}
