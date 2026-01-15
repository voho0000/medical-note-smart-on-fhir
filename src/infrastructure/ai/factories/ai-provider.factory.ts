/**
 * AI Provider Factory
 * Creates AI providers (OpenAI/Gemini) with proxy or direct API configuration
 */

import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { ENV_CONFIG } from '@/src/shared/config/env.config'
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
    const isGemini = this.isGeminiModel(config.modelId)

    if (config.useProxy) {
      return this.createProxyProvider(config.modelId, isGemini)
    } else {
      return this.createDirectProvider(config.modelId, config.apiKey!, isGemini)
    }
  }

  /**
   * Check if model is Gemini
   */
  private isGeminiModel(modelId: string): boolean {
    return modelId.startsWith('gemini') || modelId.startsWith('models/gemini')
  }

  /**
   * Create provider with proxy configuration
   */
  private createProxyProvider(modelId: string, isGemini: boolean): ProviderResult {
    const proxyUrl = isGemini ? ENV_CONFIG.geminiProxyUrl : ENV_CONFIG.chatProxyUrl
    
    const customFetch = proxyFetchInterceptor.createProxyFetch({
      proxyUrl,
      proxyClientKey: ENV_CONFIG.proxyClientKey,
      isGemini,
      modelId,
    })

    if (isGemini) {
      const provider = createGoogleGenerativeAI({
        baseURL: proxyUrl,
        apiKey: 'proxy', // Dummy key required by SDK
        fetch: customFetch,
      })
      return { model: provider(modelId), isGemini: true }
    } else {
      const provider = createOpenAI({
        baseURL: proxyUrl,
        apiKey: 'proxy', // Dummy key required by SDK
        fetch: customFetch,
      })
      // Use .chat() to force Chat Completions API instead of Responses API
      return { model: provider.chat(modelId), isGemini: false }
    }
  }

  /**
   * Create provider with direct API access
   */
  private createDirectProvider(modelId: string, apiKey: string, isGemini: boolean): ProviderResult {
    if (isGemini) {
      const provider = createGoogleGenerativeAI({ apiKey })
      return { model: provider(modelId), isGemini: true }
    } else {
      const provider = createOpenAI({ apiKey })
      return { model: provider.chat(modelId), isGemini: false }
    }
  }

  /**
   * Validate proxy availability
   */
  validateProxyAvailability(modelId: string): { available: boolean; error?: string } {
    const isGemini = this.isGeminiModel(modelId)

    if (isGemini && !ENV_CONFIG.hasGeminiProxy) {
      return {
        available: false,
        error: 'Gemini models require an API key for deep mode. Please add your Gemini API key in Settings or switch to an OpenAI model.',
      }
    }

    if (!isGemini && !ENV_CONFIG.hasChatProxy) {
      return {
        available: false,
        error: 'OpenAI proxy is not available. Please add your OpenAI API key in Settings.',
      }
    }

    return { available: true }
  }
}

export const aiProviderFactory = new AiProviderFactory()
