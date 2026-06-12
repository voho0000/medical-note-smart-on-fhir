// Claude Service (non-streaming) — AI-SDK-backed (audit C6 direction).
//
// Same shape as OpenAiService/GeminiService so the unified AiService can
// dispatch by provider, but the implementation delegates to generateText()
// instead of hand-rolled fetch. Proxy routing comes from AiProviderFactory.

import { generateText } from 'ai'
import type { AiQueryRequest, AiQueryResponse } from '@/src/core/entities/ai.entity'
import { ENV_CONFIG } from '@/src/shared/config/env.config'
import { getModelDefinition } from '@/src/shared/constants/ai-models.constants'
import { aiProviderFactory } from '../factories/ai-provider.factory'

export class ClaudeService {
  constructor(private apiKey: string | null = null) {}

  setApiKey(apiKey: string | null): void {
    this.apiKey = apiKey
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey) || ENV_CONFIG.hasClaudeProxy
  }

  async query(request: AiQueryRequest): Promise<AiQueryResponse> {
    const modelDef = getModelDefinition(request.modelId)
    const useProxy = !this.apiKey && ENV_CONFIG.hasClaudeProxy && !modelDef?.requiresUserKey

    if (!this.apiKey && !useProxy) {
      throw new Error('Claude API key is required for this model. Please add it in Settings.')
    }

    const { model } = aiProviderFactory.create({
      modelId: request.modelId,
      apiKey: this.apiKey ?? undefined,
      useProxy,
    })

    const result = await generateText({
      model,
      messages: request.messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.maxTokens !== undefined ? { maxOutputTokens: request.maxTokens } : {}),
    })

    return {
      text: result.text,
      metadata: {
        modelId: request.modelId,
        provider: 'claude',
        tokensUsed: result.usage?.totalTokens,
      },
    }
  }
}
