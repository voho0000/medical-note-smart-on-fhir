/**
 * Gemini Request Transformer
 * Transforms AI SDK Gemini native format to proxy expected format
 * 
 * AI SDK sends: { contents: [...], tools: [...], generationConfig: {...} }
 * Proxy expects: { model, messages: [...], stream: true, tools: [...] }
 */

export interface GeminiNativeRequest {
  systemInstruction?: {
    parts: Array<{ text?: string }>
  }
  contents?: Array<{
    role: string
    parts?: Array<{ text?: string }>
  }>
  tools?: unknown
  toolConfig?: unknown
  generationConfig?: unknown
  safetySettings?: unknown
}

export interface ProxyRequest {
  model: string
  messages: Array<{ role: string; content: string }>
  stream: boolean
  tools?: unknown
  toolConfig?: unknown
  generationConfig?: unknown
  safetySettings?: unknown
}

export class GeminiRequestTransformer {
  /**
   * Transform Gemini native format to proxy format
   */
  transform(nativeRequest: GeminiNativeRequest, modelId: string): ProxyRequest {
    const messages: Array<{ role: string; content: string }> = []

    // Add system instruction as system message
    if (nativeRequest.systemInstruction?.parts) {
      const systemText = nativeRequest.systemInstruction.parts
        .map((p) => p.text || '')
        .join('\n')
      if (systemText) {
        messages.push({ role: 'system', content: systemText })
      }
    }

    // Convert contents to messages
    if (Array.isArray(nativeRequest.contents)) {
      for (const content of nativeRequest.contents) {
        const role = content.role === 'model' ? 'assistant' : 'user'
        const text = content.parts
          ?.map((p) => p.text || '')
          .join('') || ''
        if (text) {
          messages.push({ role, content: text })
        }
      }
    }

    // Build proxy request body
    const proxyBody: ProxyRequest = {
      model: modelId,
      messages,
      stream: true,
    }

    // Forward optional parameters
    if (nativeRequest.tools) {
      proxyBody.tools = nativeRequest.tools
    }
    if (nativeRequest.toolConfig) {
      proxyBody.toolConfig = nativeRequest.toolConfig
    }
    if (nativeRequest.generationConfig) {
      proxyBody.generationConfig = nativeRequest.generationConfig
    }
    if (nativeRequest.safetySettings) {
      proxyBody.safetySettings = nativeRequest.safetySettings
    }

    return proxyBody
  }
}

export const geminiRequestTransformer = new GeminiRequestTransformer()
