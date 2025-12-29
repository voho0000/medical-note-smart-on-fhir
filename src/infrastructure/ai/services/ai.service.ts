// Refactored AI Service - Delegates to OpenAI and Gemini services
import type { IAiService } from '@/src/core/interfaces/services/ai.service.interface'
import type { AiQueryRequest, AiQueryResponse, AiModelDefinition } from '@/src/core/entities/ai.entity'
import { ALL_MODELS, getModelDefinition } from '@/src/shared/constants/ai-models.constants'
import { OpenAiService } from './openai.service'
import { GeminiService } from './gemini.service'

export class AiService implements IAiService {
  private openAiService: OpenAiService
  private geminiService: GeminiService

  constructor(
    private openAiApiKey: string | null = null,
    private geminiApiKey: string | null = null
  ) {
    this.openAiService = new OpenAiService(openAiApiKey)
    this.geminiService = new GeminiService(geminiApiKey)
  }

  setOpenAiApiKey(apiKey: string | null): void {
    this.openAiApiKey = apiKey
    this.openAiService.setApiKey(apiKey)
  }

  setGeminiApiKey(apiKey: string | null): void {
    this.geminiApiKey = apiKey
    this.geminiService.setApiKey(apiKey)
  }

  isAvailable(): boolean {
    return this.openAiService.isAvailable() || this.geminiService.isAvailable()
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
    }

    throw new Error(`Unsupported AI provider: ${provider}`)
  }
}
