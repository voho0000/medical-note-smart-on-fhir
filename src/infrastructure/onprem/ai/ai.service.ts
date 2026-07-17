import type { IAiService } from '@/src/core/interfaces/services/ai.service.interface'
import type {
  AiModelDefinition,
  AiQueryRequest,
  AiQueryResponse,
} from '@/src/core/entities/ai.entity'
import {
  CUSTOM_MODELS,
  CUSTOM_OPENAI_MODEL_ID,
} from '@/src/shared/constants/ai-models.constants'
import type { OpenAiCompatibleConfig } from '@/src/shared/types/openai-compatible.types'
import { OpenAiCompatibleService } from '@/src/infrastructure/ai/services/openai-compatible.service'

export class AiService implements IAiService {
  private readonly localService: OpenAiCompatibleService

  constructor(
    _openAiApiKey: string | null = null,
    _geminiApiKey: string | null = null,
    _claudeApiKey: string | null = null,
    openAiCompatibleConfig: OpenAiCompatibleConfig | null = null,
  ) {
    this.localService = new OpenAiCompatibleService(openAiCompatibleConfig)
  }

  setOpenAiApiKey(_apiKey: string | null): void {}
  setGeminiApiKey(_apiKey: string | null): void {}
  setClaudeApiKey(_apiKey: string | null): void {}

  setOpenAiCompatibleConfig(config: OpenAiCompatibleConfig | null): void {
    this.localService.setConfig(config)
  }

  isAvailable(): boolean {
    return this.localService.isAvailable()
  }

  getSupportedModels(): AiModelDefinition[] {
    return [...CUSTOM_MODELS]
  }

  async query(request: AiQueryRequest): Promise<AiQueryResponse> {
    if (request.modelId !== CUSTOM_OPENAI_MODEL_ID) {
      throw new Error(`Model ${request.modelId} is disabled by the onprem deployment profile`)
    }
    return this.localService.query(request)
  }
}
