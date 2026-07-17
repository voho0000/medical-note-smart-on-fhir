// Refactored AI Service - Delegates to OpenAI and Gemini services
import type { IAiService } from '@/src/core/interfaces/services/ai.service.interface'
import type { AiQueryRequest, AiQueryResponse, AiModelDefinition } from '@/src/core/entities/ai.entity'
import { ALL_MODELS, getModelDefinition } from '@/src/shared/constants/ai-models.constants'
import { OpenAiService } from './openai.service'
import { GeminiService } from './gemini.service'
import { ClaudeService } from './claude.service'
import { OpenAiCompatibleService } from './openai-compatible.service'
import type { OpenAiCompatibleConfig } from '@/src/shared/types/openai-compatible.types'

export class AiService implements IAiService {
  private openAiService: OpenAiService
  private geminiService: GeminiService
  private claudeService: ClaudeService
  private openAiCompatibleService: OpenAiCompatibleService

  constructor(
    private openAiApiKey: string | null = null,
    private geminiApiKey: string | null = null,
    private claudeApiKey: string | null = null,
    private openAiCompatibleConfig: OpenAiCompatibleConfig | null = null,
  ) {
    this.openAiService = new OpenAiService(openAiApiKey)
    this.geminiService = new GeminiService(geminiApiKey)
    this.claudeService = new ClaudeService(claudeApiKey)
    this.openAiCompatibleService = new OpenAiCompatibleService(openAiCompatibleConfig)
  }

  setOpenAiApiKey(apiKey: string | null): void {
    this.openAiApiKey = apiKey
    this.openAiService.setApiKey(apiKey)
  }

  setGeminiApiKey(apiKey: string | null): void {
    this.geminiApiKey = apiKey
    this.geminiService.setApiKey(apiKey)
  }

  setClaudeApiKey(apiKey: string | null): void {
    this.claudeApiKey = apiKey
    this.claudeService.setApiKey(apiKey)
  }

  setOpenAiCompatibleConfig(config: OpenAiCompatibleConfig | null): void {
    this.openAiCompatibleConfig = config
    this.openAiCompatibleService.setConfig(config)
  }

  isAvailable(): boolean {
    return this.openAiService.isAvailable() ||
      this.geminiService.isAvailable() ||
      this.claudeService.isAvailable() ||
      this.openAiCompatibleService.isAvailable()
  }

  getSupportedModels(): AiModelDefinition[] {
    return [...ALL_MODELS]
  }

  async query(request: AiQueryRequest): Promise<AiQueryResponse> {
    const modelDef = getModelDefinition(request.modelId)
    const provider = modelDef?.provider ?? 'openai'

    if (provider === 'openai') {
      return await this.openAiService.query(request)
    } else if (provider === 'gemini') {
      return await this.geminiService.query(request)
    } else if (provider === 'claude') {
      return await this.claudeService.query(request)
    } else if (provider === 'custom') {
      return await this.openAiCompatibleService.query(request)
    }

    throw new Error(`Unsupported AI provider: ${provider}`)
  }
}
