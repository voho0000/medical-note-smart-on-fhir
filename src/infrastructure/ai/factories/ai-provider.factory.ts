/**
 * AI Provider Factory
 * Creates AI providers (OpenAI/Gemini) with proxy or direct API configuration
 */

import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createAnthropic } from '@ai-sdk/anthropic'
import { ENV_CONFIG } from '@/src/shared/config/env.config'
import { DEPLOYMENT_CONFIG } from '@/src/shared/config/deployment-profile.config'
import {
  getModelDefinitionOrThrow,
  isProxyEligibleModel,
  isCustomOpenAiModelId,
  type ModelDefinition,
  type ModelProvider,
} from '@/src/shared/constants/ai-models.constants'
import type { OpenAiCompatibleConfig } from '@/src/shared/types/openai-compatible.types'
import { isOpenAiCompatibleRuntimeReady, resolveOpenAiCompatibleBaseUrl } from '@/src/shared/utils/openai-compatible.utils'
import { proxyFetchInterceptor } from '../interceptors/proxy-fetch.interceptor'
import {
  createConfiguredOpenAiCompatibleFetch,
  openAiCompatibleSdkKey,
} from '../openai-compatible/openai-compatible.client'

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
  /**
   * Create AI provider with appropriate configuration
   */
  create(config: ProviderConfig): ProviderResult {
    const isCustom = isCustomOpenAiModelId(config.modelId)
    if (DEPLOYMENT_CONFIG.isOnPrem && !isCustom) {
      throw new Error(
        `Model ${config.modelId} is disabled by the onprem deployment profile`,
      )
    }
    if (isCustom) {
      return this.createOpenAiCompatibleProvider(config.openAiCompatible)
    }
    const definition = getModelDefinitionOrThrow(config.modelId)

    if (config.useProxy) {
      if (!isProxyEligibleModel(definition)) {
        throw new Error(`Model ${config.modelId} is not eligible for the MediPrisma proxy`)
      }
      return this.createProxyProvider(definition)
    } else {
      if (!config.apiKey) throw new Error(`API key is required for model ${config.modelId}`)
      return this.createDirectProvider(definition, config.apiKey)
    }
  }

  /**
   * Create provider with proxy configuration
   */
  private createProxyProvider(definition: ModelDefinition): ProviderResult {
    const { id: modelId, provider } = definition
    if (provider === 'custom') {
      throw new Error('OpenAI-compatible endpoints must be called directly from the browser')
    }
    const proxyUrl =
      provider === 'gemini' ? ENV_CONFIG.geminiProxyUrl :
      provider === 'claude' ? ENV_CONFIG.claudeProxyUrl :
      ENV_CONFIG.chatProxyUrl

    const customFetch = proxyFetchInterceptor.createProxyFetch({
      proxyUrl,
      proxyClientKey: ENV_CONFIG.proxyClientKey,
      isGemini: provider === 'gemini',
      isClaude: provider === 'claude',
      modelId,
    })

    if (provider === 'gemini') {
      const sdk = createGoogleGenerativeAI({
        baseURL: proxyUrl,
        apiKey: 'proxy', // Dummy key required by SDK
        fetch: customFetch,
      })
      return { model: sdk(modelId), isGemini: true }
    }
    if (provider === 'claude') {
      const sdk = createAnthropic({
        baseURL: proxyUrl,
        apiKey: 'proxy', // Dummy key required by SDK
        fetch: customFetch,
      })
      return { model: sdk(modelId), isGemini: false }
    }
    const sdk = createOpenAI({
      baseURL: proxyUrl,
      apiKey: 'proxy', // Dummy key required by SDK
      fetch: customFetch,
    })
    if (definition.apiSurface === 'openai-chat-completions') {
      return { model: sdk.chat(modelId), isGemini: false }
    }
    if (definition.apiSurface === 'openai-responses') {
      return { model: sdk.responses(modelId), isGemini: false }
    }
    throw new Error(`OpenAI model ${modelId} has incompatible API surface ${definition.apiSurface}`)
  }

  /**
   * Create provider with direct API access
   */
  private createDirectProvider(definition: ModelDefinition, apiKey: string): ProviderResult {
    const { id: modelId, provider } = definition
    if (provider === 'custom') {
      throw new Error('OpenAI-compatible connection profile is missing')
    }
    if (provider === 'gemini') {
      const sdk = createGoogleGenerativeAI({ apiKey })
      return { model: sdk(modelId), isGemini: true }
    }
    if (provider === 'claude') {
      const sdk = createAnthropic({
        apiKey,
        // Anthropic blocks browser-origin calls unless explicitly opted in;
        // BYO-key direct mode runs in the browser by design here
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      })
      return { model: sdk(modelId), isGemini: false }
    }
    const sdk = createOpenAI({ apiKey })
    if (definition.apiSurface === 'openai-responses') {
      return { model: sdk.responses(modelId), isGemini: false }
    }
    if (definition.apiSurface === 'openai-chat-completions') {
      return { model: sdk.chat(modelId), isGemini: false }
    }
    throw new Error(`OpenAI model ${modelId} has incompatible API surface ${definition.apiSurface}`)
  }

  private createOpenAiCompatibleProvider(
    config: OpenAiCompatibleConfig | null | undefined,
  ): ProviderResult {
    if (!isOpenAiCompatibleRuntimeReady(config)) {
      throw new Error('OpenAI-compatible endpoint is not configured')
    }
    const sdk = createOpenAI({
      baseURL: resolveOpenAiCompatibleBaseUrl(config.baseUrl),
      apiKey: openAiCompatibleSdkKey(config.apiKey),
      fetch: createConfiguredOpenAiCompatibleFetch(config),
    })
    // Chat Completions is the compatibility contract used by vLLM, Ollama,
    // LM Studio and hospital gateways. The user's real upstream id is sent;
    // the logical sentinel never leaves the browser.
    return { model: sdk.chat(config.modelId), isGemini: false }
  }

  /**
   * Validate proxy availability
   */
  validateProxyAvailability(modelId: string): { available: boolean; error?: string } {
    if (DEPLOYMENT_CONFIG.isOnPrem) {
      return {
        available: false,
        error: isCustomOpenAiModelId(modelId)
          ? 'OpenAI-compatible endpoints do not use the MediPrisma proxy.'
          : 'Cloud AI is disabled by the onprem deployment profile.',
      }
    }

    let definition: ModelDefinition
    try {
      definition = getModelDefinitionOrThrow(modelId)
    } catch (error) {
      return { available: false, error: error instanceof Error ? error.message : 'Unsupported AI model' }
    }
    const provider: ModelProvider = definition.provider

    if (provider === 'custom') {
      return {
        available: false,
        error: 'OpenAI-compatible endpoints do not use the MediPrisma proxy.',
      }
    }

    if (!isProxyEligibleModel(definition)) {
      return {
        available: false,
        error: 'This model requires a personal provider API key.',
      }
    }

    if (provider === 'gemini' && !ENV_CONFIG.hasGeminiProxy) {
      return {
        available: false,
        error: 'Gemini models require an API key for AI chat. Please add your Gemini API key in Settings or switch to an OpenAI model.',
      }
    }

    if (provider === 'claude' && !ENV_CONFIG.hasClaudeProxy) {
      return {
        available: false,
        error: 'Claude proxy is not available. Please add your Claude API key in Settings.',
      }
    }

    if (provider === 'openai' && !ENV_CONFIG.hasChatProxy) {
      return {
        available: false,
        error: 'OpenAI proxy is not available. Please add your OpenAI API key in Settings.',
      }
    }

    return { available: true }
  }
}
