import type { IAiService } from '@/src/core/interfaces/services/ai.service.interface'
import type { AiQueryRequest, AiQueryResponse, AiModelDefinition } from '@/src/core/entities/ai.entity'
import {
  ALL_MODELS,
  getModelDefinitionOrThrow,
  type ModelProvider,
} from '@/src/shared/constants/ai-models.constants'
import type { OpenAiCompatibleProfile } from '@/src/shared/types/openai-compatible.types'
import {
  isOpenAiCompatibleRuntimeReady,
  resolveOpenAiCompatibleProfile,
} from '@/src/shared/utils/openai-compatible.utils'

export interface AiQueryProviderService {
  query(request: AiQueryRequest): Promise<AiQueryResponse>
  isAvailable(): boolean
}

type CloudModelProvider = Exclude<ModelProvider, 'custom'>

/** Explicit dependencies supplied by the application composition root. */
export interface AiServiceDependencies {
  cloudServices: Readonly<Record<CloudModelProvider, AiQueryProviderService>>
  createCustomService(profile: OpenAiCompatibleProfile | null): AiQueryProviderService
}

/** Provider dispatcher only; concrete transports are wired elsewhere. */
export class AiService implements IAiService {
  constructor(
    private readonly dependencies: AiServiceDependencies,
    private readonly openAiCompatibleProfiles: readonly OpenAiCompatibleProfile[] = [],
  ) {}

  isAvailable(): boolean {
    return Object.values(this.dependencies.cloudServices).some((service) => service.isAvailable()) ||
      this.openAiCompatibleProfiles.some((profile) => isOpenAiCompatibleRuntimeReady(profile))
  }

  getSupportedModels(): AiModelDefinition[] {
    return [...ALL_MODELS]
  }

  async query(request: AiQueryRequest): Promise<AiQueryResponse> {
    const definition = getModelDefinitionOrThrow(request.modelId)
    if (definition.provider === 'custom') {
      const profile = resolveOpenAiCompatibleProfile(
        request.modelId,
        this.openAiCompatibleProfiles,
      )
      return this.dependencies.createCustomService(profile).query(request)
    }

    return this.dependencies.cloudServices[definition.provider].query(request)
  }
}
