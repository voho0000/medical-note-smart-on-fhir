// Service Interface: Transcription (ASR)
import type {
  TranscriptionRequest,
  TranscriptionResponse
} from '@/src/core/entities/ai.entity'

export interface ITranscriptionService {
  /**
   * Transcribe audio to text
   */
  transcribe(request: TranscriptionRequest): Promise<TranscriptionResponse>
  
  /**
   * Check if service is available
   */
  isAvailable(): boolean
}
