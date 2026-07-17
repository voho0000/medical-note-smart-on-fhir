import type { AiQueryRequest, AiQueryResponse } from '@/src/core/entities/ai.entity'
import type { ITranscriptionService } from '@/src/core/interfaces/services/transcription.service.interface'
import type { TranscriptionRequest, TranscriptionResponse } from '@/src/core/entities/ai.entity'

const disabled = () => new Error('Cloud AI is disabled by the onprem deployment profile')

export class OpenAiService {
  readonly name = 'openai'
  constructor(_apiKey: string | null = null) {}
  setApiKey(_apiKey: string | null): void {}
  isAvailable(): boolean { return false }
  async query(_request: AiQueryRequest): Promise<AiQueryResponse> { throw disabled() }
}

export class TranscriptionService implements ITranscriptionService {
  constructor(_apiKey: string | null = null) {}
  setApiKey(_apiKey: string | null): void {}
  isAvailable(): boolean { return false }
  async transcribe(_request: TranscriptionRequest): Promise<TranscriptionResponse> {
    throw disabled()
  }
}
