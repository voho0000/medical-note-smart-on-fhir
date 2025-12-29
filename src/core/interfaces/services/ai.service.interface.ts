// Service Interface: AI/LLM
import type {
  AiQueryRequest,
  AiQueryResponse,
  AiModelDefinition
} from '@/src/core/entities/ai.entity'

export interface IAiService {
  /**
   * Query AI model with messages
   */
  query(request: AiQueryRequest): Promise<AiQueryResponse>
  
  /**
   * Check if service is available (has API key or proxy)
   */
  isAvailable(): boolean
  
  /**
   * Get supported models
   */
  getSupportedModels(): AiModelDefinition[]
}
