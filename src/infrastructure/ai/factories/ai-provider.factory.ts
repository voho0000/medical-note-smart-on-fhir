/**
 * AI Provider Factory
 * Creates AI providers (OpenAI/Gemini) with proxy or direct API configuration
 */

import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createAnthropic } from '@ai-sdk/anthropic'
import { ENV_CONFIG } from '@/src/shared/config/env.config'
import { getModelDefinition, type ModelProvider } from '@/src/shared/constants/ai-models.constants'
import { proxyFetchInterceptor } from '../interceptors/proxy-fetch.interceptor'

export interface ProviderConfig {
  modelId: string
  apiKey?: string
  useProxy: boolean
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
    const provider = this.providerOf(config.modelId)

    if (config.useProxy) {
      return this.createProxyProvider(config.modelId, provider)
    } else {
      return this.createDirectProvider(config.modelId, config.apiKey!, provider)
    }
  }

  /**
   * Resolve the provider from the model definition (id-prefix fallback for
   * unknown/internal ids)
   */
  private providerOf(modelId: string): ModelProvider {
    const def = getModelDefinition(modelId)
    if (def) return def.provider
    if (modelId.startsWith('gemini') || modelId.startsWith('models/gemini')) return 'gemini'
    if (modelId.startsWith('claude')) return 'claude'
    return 'openai'
  }

  /**
   * Create provider with proxy configuration
   */
  private createProxyProvider(modelId: string, provider: ModelProvider): ProviderResult {
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
    // Use .chat() to force Chat Completions API instead of Responses API
    return { model: sdk.chat(modelId), isGemini: false }
  }

  /**
   * Create provider with direct API access
   */
  private createDirectProvider(modelId: string, apiKey: string, provider: ModelProvider): ProviderResult {
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
    return { model: sdk.chat(modelId), isGemini: false }
  }

  /**
   * Validate proxy availability
   */
  validateProxyAvailability(modelId: string): { available: boolean; error?: string } {
    const provider = this.providerOf(modelId)

    if (provider === 'gemini' && !ENV_CONFIG.hasGeminiProxy) {
      return {
        available: false,
        error: 'Gemini models require an API key for deep mode. Please add your Gemini API key in Settings or switch to an OpenAI model.',
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

export const aiProviderFactory = new AiProviderFactory()
