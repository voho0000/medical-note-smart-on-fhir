import { createOpenAI } from '@ai-sdk/openai'
import { CUSTOM_OPENAI_MODEL_ID } from '@/src/shared/constants/ai-models.constants'
import type { OpenAiCompatibleConfig } from '@/src/shared/types/openai-compatible.types'
import {
  isOpenAiCompatibleReady,
  resolveOpenAiCompatibleBaseUrl,
} from '@/src/shared/utils/openai-compatible.utils'
import {
  createOpenAiCompatibleFetch,
  openAiCompatibleSdkKey,
} from '@/src/infrastructure/ai/openai-compatible/openai-compatible.client'

export interface ProviderConfig {
  modelId: string
  apiKey?: string
  useProxy: boolean
  openAiCompatible?: OpenAiCompatibleConfig | null
}

export interface ProviderResult {
  model: any
  isGemini: boolean
}

export class AiProviderFactory {
  create(config: ProviderConfig): ProviderResult {
    if (config.modelId !== CUSTOM_OPENAI_MODEL_ID) {
      throw new Error(`Model ${config.modelId} is disabled by the onprem deployment profile`)
    }
    if (!isOpenAiCompatibleReady(config.openAiCompatible)) {
      throw new Error('OpenAI-compatible endpoint is not configured')
    }

    const endpoint = config.openAiCompatible
    const sdk = createOpenAI({
      baseURL: resolveOpenAiCompatibleBaseUrl(endpoint.baseUrl),
      apiKey: openAiCompatibleSdkKey(endpoint.apiKey),
      fetch: createOpenAiCompatibleFetch(endpoint.apiKey),
    })
    return { model: sdk.chat(endpoint.modelId), isGemini: false }
  }

  validateProxyAvailability(modelId: string): { available: boolean; error?: string } {
    return {
      available: false,
      error: modelId === CUSTOM_OPENAI_MODEL_ID
        ? 'OpenAI-compatible endpoints do not use the MediPrisma proxy.'
        : 'Cloud AI is disabled by the onprem deployment profile.',
    }
  }
}

export const aiProviderFactory = new AiProviderFactory()
