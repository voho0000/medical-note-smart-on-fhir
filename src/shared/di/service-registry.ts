// Service Registry
// Registers all services with the DI container

import { container } from './service-container'
import { ServiceKeys } from './service-keys'

// Repositories
import { FhirClinicalDataRepository } from '@/src/infrastructure/fhir/repositories/clinical-data.repository'
import { FhirPatientRepository } from '@/src/infrastructure/fhir/repositories/patient.repository'

// Services
import { AiService } from '@/src/infrastructure/ai/services/ai.service'
import { OpenAiService } from '@/src/infrastructure/ai/services/openai.service'
import { GeminiService } from '@/src/infrastructure/ai/services/gemini.service'
import { TranscriptionService } from '@/src/infrastructure/ai/services/transcription.service'
import { StorageService } from '@/src/shared/utils/storage.utils'
import { FhirClientService } from '@/src/infrastructure/fhir/client/fhir-client.service'

// Use Cases
import { FetchClinicalDataUseCase } from '@/src/core/use-cases/clinical-data/fetch-clinical-data.use-case'
import { GetPatientUseCase } from '@/src/core/use-cases/patient/get-patient.use-case'
import { QueryAiUseCase } from '@/src/core/use-cases/ai/query-ai.use-case'
import { TranscribeAudioUseCase } from '@/src/core/use-cases/transcription/transcribe-audio.use-case'

/**
 * Register all services with the DI container
 * This should be called once at application startup
 */
export function registerServices(config?: {
  openAiApiKey?: string | null
  geminiApiKey?: string | null
  storageType?: 'localStorage' | 'sessionStorage'
  whisperApiKey?: string | null
}): void {
  const {
    openAiApiKey = null,
    geminiApiKey = null,
    storageType = 'localStorage',
    whisperApiKey = null,
  } = config || {}

  // Register Repositories (singleton)
  container.register(
    ServiceKeys.FHIR_CLINICAL_DATA_REPOSITORY,
    () => new FhirClinicalDataRepository(),
    true
  )

  container.register(
    ServiceKeys.FHIR_PATIENT_REPOSITORY,
    () => new FhirPatientRepository(),
    true
  )

  // Register Services (singleton)
  container.register(
    ServiceKeys.FHIR_CLIENT_SERVICE,
    () => FhirClientService.getInstance(),
    true
  )

  container.register(
    ServiceKeys.STORAGE_SERVICE,
    () => new StorageService(storageType),
    true
  )

  container.register(
    ServiceKeys.OPENAI_SERVICE,
    () => new OpenAiService(openAiApiKey),
    false // Not singleton - may need different API keys
  )

  container.register(
    ServiceKeys.GEMINI_SERVICE,
    () => new GeminiService(geminiApiKey),
    false // Not singleton - may need different API keys
  )

  container.register(
    ServiceKeys.AI_SERVICE,
    () => new AiService(openAiApiKey, geminiApiKey),
    false // Not singleton - may need different API keys
  )

  container.register(
    ServiceKeys.TRANSCRIPTION_SERVICE,
    () => new TranscriptionService(whisperApiKey),
    false // Not singleton - may need different API keys
  )

  // Register Use Cases (not singleton - create new instance each time)
  container.register(
    ServiceKeys.FETCH_CLINICAL_DATA_USE_CASE,
    () => new FetchClinicalDataUseCase(
      container.resolve(ServiceKeys.FHIR_CLINICAL_DATA_REPOSITORY)
    ),
    false
  )

  container.register(
    ServiceKeys.GET_PATIENT_USE_CASE,
    () => new GetPatientUseCase(
      container.resolve(ServiceKeys.FHIR_PATIENT_REPOSITORY)
    ),
    false
  )

  container.register(
    ServiceKeys.QUERY_AI_USE_CASE,
    () => new QueryAiUseCase(
      container.resolve(ServiceKeys.AI_SERVICE)
    ),
    false
  )

  container.register(
    ServiceKeys.TRANSCRIBE_AUDIO_USE_CASE,
    () => new TranscribeAudioUseCase(
      container.resolve(ServiceKeys.TRANSCRIPTION_SERVICE)
    ),
    false
  )
}

/**
 * Update service configuration (e.g., when API keys change)
 */
export function updateServiceConfig(config: {
  openAiApiKey?: string | null
  geminiApiKey?: string | null
  whisperApiKey?: string | null
}): void {
  // Clear cached instances for services that depend on config
  container.clearInstance(ServiceKeys.OPENAI_SERVICE)
  container.clearInstance(ServiceKeys.GEMINI_SERVICE)
  container.clearInstance(ServiceKeys.AI_SERVICE)
  container.clearInstance(ServiceKeys.TRANSCRIPTION_SERVICE)

  // Re-register with new config
  if (config.openAiApiKey !== undefined) {
    container.register(
      ServiceKeys.OPENAI_SERVICE,
      () => new OpenAiService(config.openAiApiKey),
      false
    )
  }

  if (config.geminiApiKey !== undefined) {
    container.register(
      ServiceKeys.GEMINI_SERVICE,
      () => new GeminiService(config.geminiApiKey),
      false
    )
  }

  if (config.openAiApiKey !== undefined || config.geminiApiKey !== undefined) {
    container.register(
      ServiceKeys.AI_SERVICE,
      () => new AiService(config.openAiApiKey, config.geminiApiKey),
      false
    )
  }

  if (config.whisperApiKey !== undefined) {
    container.register(
      ServiceKeys.TRANSCRIPTION_SERVICE,
      () => new TranscriptionService(config.whisperApiKey),
      false
    )
  }
}
