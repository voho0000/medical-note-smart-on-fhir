// Use Case: Transcribe Audio
import type { ITranscriptionService } from '@/src/core/interfaces/services/transcription.service.interface'
import type { TranscriptionRequest, TranscriptionResponse } from '@/src/core/entities/ai.entity'

export class TranscribeAudioUseCase {
  constructor(private transcriptionService: ITranscriptionService) {}

  async execute(request: TranscriptionRequest): Promise<TranscriptionResponse> {
    if (!this.transcriptionService.isAvailable()) {
      throw new Error('Transcription service is not available. Please configure API key or proxy.')
    }

    if (request.audioBlob.size === 0) {
      throw new Error('Audio blob is empty')
    }

    return await this.transcriptionService.transcribe(request)
  }
}
