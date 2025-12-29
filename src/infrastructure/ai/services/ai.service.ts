// AI Service Implementation (OpenAI + Gemini)
import type { IAiService } from '@/src/core/interfaces/services/ai.service.interface'
import type {
  AiQueryRequest,
  AiQueryResponse,
  AiModelDefinition,
  AiMessage
} from '@/src/core/entities/ai.entity'
import { ENV_CONFIG } from '@/src/shared/config/env.config'
import { ALL_MODELS, isBuiltInModelId, isGeminiModelId, getModelDefinition } from '@/src/shared/constants/ai-models.constants'

export class AiService implements IAiService {
  constructor(
    private openAiApiKey: string | null = null,
    private geminiApiKey: string | null = null
  ) {}

  setOpenAiApiKey(apiKey: string | null): void {
    this.openAiApiKey = apiKey
  }

  setGeminiApiKey(apiKey: string | null): void {
    this.geminiApiKey = apiKey
  }

  isAvailable(): boolean {
    return Boolean(this.openAiApiKey || this.geminiApiKey || ENV_CONFIG.hasChatProxy || ENV_CONFIG.hasGeminiProxy)
  }

  getSupportedModels(): AiModelDefinition[] {
    return [...ALL_MODELS]
  }

  async query(request: AiQueryRequest): Promise<AiQueryResponse> {
    const modelDef = getModelDefinition(request.modelId)
    const provider = modelDef?.provider ?? 'openai'

    if (provider === 'openai') {
      return await this.queryOpenAi(request)
    } else if (provider === 'gemini') {
      return await this.queryGemini(request)
    }

    throw new Error(`Unsupported AI provider: ${provider}`)
  }

  private async queryOpenAi(request: AiQueryRequest): Promise<AiQueryResponse> {
    const modelDef = getModelDefinition(request.modelId)
    const shouldUseProxy = !this.openAiApiKey && isBuiltInModelId(request.modelId) && ENV_CONFIG.hasChatProxy

    if (!this.openAiApiKey && !shouldUseProxy) {
      if (modelDef?.requiresUserKey) {
        throw new Error('This model requires a personal OpenAI API key')
      }
      throw new Error('OpenAI API key or proxy is required')
    }

    const targetUrl = shouldUseProxy ? ENV_CONFIG.chatProxyUrl : '/api/llm'
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    const body: Record<string, unknown> = {
      model: request.modelId,
      messages: request.messages,
      stream: false
    }

    // Special handling for gpt-5-mini
    if (request.modelId === 'gpt-5-mini') {
      body.temperature = 1
    } else if (request.temperature !== undefined) {
      body.temperature = request.temperature
    }

    if (shouldUseProxy && ENV_CONFIG.proxyClientKey) {
      headers['x-proxy-key'] = ENV_CONFIG.proxyClientKey
    } else if (this.openAiApiKey) {
      headers['x-openai-key'] = this.openAiApiKey
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }))
        throw new Error(errorData.error?.message || errorData.error || 'OpenAI API request failed')
      }

      const data = await response.json()
      const text = this.extractOpenAiContent(data, shouldUseProxy)

      return {
        text,
        metadata: {
          modelId: request.modelId,
          provider: 'openai'
        }
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private async queryGemini(request: AiQueryRequest): Promise<AiQueryResponse> {
    const shouldUseProxy = !this.geminiApiKey && ENV_CONFIG.hasGeminiProxy

    if (!this.geminiApiKey && !shouldUseProxy) {
      throw new Error('Gemini API key or proxy is required')
    }

    let targetUrl: string
    let body: Record<string, unknown>
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    if (shouldUseProxy) {
      targetUrl = '/api/gemini-proxy'
      body = {
        messages: request.messages,
        model: request.modelId
      }
    } else {
      const trimmedKey = this.geminiApiKey?.trim()
      if (!trimmedKey) {
        throw new Error('Gemini API key is not set')
      }
      targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${request.modelId}:generateContent?key=${encodeURIComponent(trimmedKey)}`
      body = {
        contents: this.transformMessagesForGemini(request.messages)
      }
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }))
        throw new Error(errorData.error?.message || errorData.error || 'Gemini API request failed')
      }

      const data = await response.json()
      const text = this.extractGeminiContent(data, shouldUseProxy)

      return {
        text,
        metadata: {
          modelId: request.modelId,
          provider: 'gemini'
        }
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private extractOpenAiContent(data: any, isProxy: boolean): string {
    if (isProxy) {
      const proxyPayload = data?.message ?? data?.openAiResponse ?? data
      return this.extractMessageContent(proxyPayload)
    } else {
      const directPayload = data?.choices ?? data
      return this.extractMessageContent(directPayload)
    }
  }

  private extractMessageContent(payload: unknown): string {
    if (!payload) return ''
    if (typeof payload === 'string') return payload
    if (Array.isArray(payload)) {
      return payload
        .map(item => this.extractMessageContent(item))
        .filter(item => typeof item === 'string' && item.trim().length > 0)
        .join('\n')
    }
    if (typeof payload === 'object') {
      const record = payload as Record<string, unknown>
      
      if (record.content) {
        const extracted = this.extractMessageContent(record.content)
        if (extracted) return extracted
      }
      
      if (typeof record.text === 'string') {
        return record.text
      }
      
      if (record.message) {
        const extracted = this.extractMessageContent(record.message)
        if (extracted) return extracted
      }
      
      if (Array.isArray(record.choices)) {
        for (const choice of record.choices) {
          const extracted = this.extractMessageContent(choice)
          if (extracted) return extracted
        }
      }
    }
    return ''
  }

  private extractGeminiContent(data: any, isProxy: boolean): string {
    if (isProxy) {
      const proxyPayload = data?.message ?? data
      return this.extractMessageContent(proxyPayload) || this.extractGeminiContentRecursive(proxyPayload)
    } else {
      return this.extractGeminiContentRecursive(data)
    }
  }

  private extractGeminiContentRecursive(payload: unknown): string {
    if (!payload) return ''
    if (typeof payload === 'string') return payload
    if (Array.isArray(payload)) {
      for (const entry of payload) {
        const extracted = this.extractGeminiContentRecursive(entry)
        if (extracted) return extracted
      }
      return ''
    }

    if (typeof payload === 'object') {
      const record = payload as Record<string, unknown>

      if (Array.isArray(record.candidates)) {
        for (const candidate of record.candidates) {
          const extracted = this.extractGeminiContentRecursive(candidate)
          if (extracted) return extracted
        }
      }

      if (record.content) {
        const extracted = this.extractGeminiContentRecursive(record.content)
        if (extracted) return extracted
      }

      if (Array.isArray(record.parts)) {
        const texts = record.parts
          .map((part: any) => {
            if (!part || typeof part !== 'object') return ''
            const { text } = part as Record<string, unknown>
            return typeof text === 'string' ? text : ''
          })
          .filter((text: string) => text.trim().length > 0)

        if (texts.length > 0) {
          return texts.join('\n')
        }
      }

      if (typeof record.text === 'string') {
        return record.text
      }
    }

    return ''
  }

  private transformMessagesForGemini(messages: AiMessage[]): Array<{ role: string; parts: Array<{ text: string }> }> {
    return messages.map(message => {
      const baseRole = message.role === 'assistant' ? 'model' : 'user'
      const role = message.role === 'system' ? 'user' : baseRole
      const text = message.role === 'system' ? `System instruction:\n${message.content}` : message.content
      return {
        role,
        parts: [{ text }]
      }
    })
  }
}
