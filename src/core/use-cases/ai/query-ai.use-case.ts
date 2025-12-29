// Use Case: Query AI
import type { IAiService } from '@/src/core/interfaces/services/ai.service.interface'
import type { AiQueryRequest, AiQueryResponse } from '@/src/core/entities/ai.entity'

export class QueryAiUseCase {
  constructor(private aiService: IAiService) {}

  async execute(request: AiQueryRequest): Promise<AiQueryResponse> {
    if (!this.aiService.isAvailable()) {
      throw new Error('AI service is not available. Please configure API key or proxy.')
    }

    return await this.aiService.query(request)
  }
}
