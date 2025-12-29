// Service Keys for Dependency Injection
// Centralized registry of all service identifiers

export const ServiceKeys = {
  // Repositories
  FHIR_CLINICAL_DATA_REPOSITORY: 'fhirClinicalDataRepository',
  FHIR_PATIENT_REPOSITORY: 'fhirPatientRepository',
  
  // Services
  AI_SERVICE: 'aiService',
  OPENAI_SERVICE: 'openaiService',
  GEMINI_SERVICE: 'geminiService',
  TRANSCRIPTION_SERVICE: 'transcriptionService',
  STORAGE_SERVICE: 'storageService',
  FHIR_CLIENT_SERVICE: 'fhirClientService',
  
  // Use Cases
  FETCH_CLINICAL_DATA_USE_CASE: 'fetchClinicalDataUseCase',
  GET_PATIENT_USE_CASE: 'getPatientUseCase',
  QUERY_AI_USE_CASE: 'queryAiUseCase',
  TRANSCRIBE_AUDIO_USE_CASE: 'transcribeAudioUseCase',
} as const

export type ServiceKey = typeof ServiceKeys[keyof typeof ServiceKeys]
