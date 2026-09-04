// Standard chat sends the same fitted clinical selection as Medical Summary
// and Clinical Insights, so it must ask useClinicalAiInput for the same
// VGHBrain policy: a 100K clinical-token cap and no text truncation.
import { renderHook } from '@testing-library/react'
import { useAgentChat } from '@/features/medical-chat/hooks/useAgentChat'
import { useAiConfigStore } from '@/src/application/stores/ai-config.store'
import { CUSTOM_OPENAI_MODEL_ID } from '@/src/shared/constants/ai-models.constants'
import {
  VGHBRAIN_CLINICAL_TOKEN_LIMIT,
  VGHBRAIN_CONTEXT_LIMIT,
} from '@/src/shared/utils/vghbrain-context-policy'
import type { OpenAiCompatibleProfile } from '@/src/shared/types/openai-compatible.types'

const mockUseClinicalAiInput = jest.fn()

jest.mock('@/src/application/stores/chat.store', () => ({
  useChatMessages: () => [],
  useSetChatMessages: () => jest.fn(),
}))
jest.mock('@/src/application/hooks/patient/use-patient-query.hook', () => ({
  usePatient: () => ({ patient: { id: 'patient-1' } }),
}))
jest.mock('@/src/application/hooks/ai-generation/use-clinical-ai-input.hook', () => ({
  useClinicalAiInput: (...args: unknown[]) => {
    mockUseClinicalAiInput(...args)
    return { clinicalContext: '', dataReady: true, contextAdaptation: null, inputSignature: '' }
  },
}))
jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    locale: 'zh-TW',
    t: {
      agent: { thinking: 'thinking', apiKeyRequired: 'API key required' },
      settings: { openAiCompatibleNotConfigured: 'Custom endpoint not configured' },
      medicalChat: { localStandardContextTooLarge: 'Context too large' },
    },
  }),
}))
jest.mock('@/src/application/hooks/ai/use-fhir-tools.hook', () => ({
  useFhirTools: () => undefined,
}))
jest.mock('@/src/application/hooks/ai/use-literature-tools.hook', () => ({
  useLiteratureTools: () => undefined,
}))
jest.mock('@/src/infrastructure/fhir/client/fhir-client.service', () => ({
  shouldUseLocalBundle: () => false,
}))
jest.mock('@/src/application/providers/auth.provider', () => ({
  useAuth: () => ({ user: null, isAnonymous: false }),
}))

const VGHBRAIN_PROFILE: OpenAiCompatibleProfile = {
  profileId: 'vghtpe-tvghbrain',
  enabled: true,
  baseUrl: 'https://whisper.vghtpe.gov.tw:30001/v1',
  modelId: 'tvghbrain3.5',
  apiKey: 'runtime-secret',
  transport: 'direct',
}

const GENERIC_PROFILE: OpenAiCompatibleProfile = {
  profileId: 'legacy',
  enabled: true,
  baseUrl: 'https://hospital.example/v1',
  modelId: 'hospital-7b',
  apiKey: 'local-key',
  transport: 'direct',
  contextWindowTokens: 32768,
  contextWindowSource: 'manual',
}

describe('useAgentChat clinical input policy', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useAiConfigStore.setState({
      apiKey: null,
      geminiKey: null,
      claudeKey: null,
      perplexityKey: null,
      openAiCompatibleProfiles: [],
    })
  })

  it('caps clinical tokens at 100K and forbids text truncation for VGHBrain', () => {
    useAiConfigStore.setState({ openAiCompatibleProfiles: [VGHBRAIN_PROFILE] })
    renderHook(() => useAgentChat('system', `${CUSTOM_OPENAI_MODEL_ID}:vghtpe-tvghbrain`))

    const [contextLimit, consumer, fraction, allowTextTruncation, maxClinicalTokens] =
      mockUseClinicalAiInput.mock.calls[0]
    expect(contextLimit).toBe(VGHBRAIN_CONTEXT_LIMIT)
    expect(consumer).toBe('insights')
    expect(fraction).toBe(1)
    expect(allowTextTruncation).toBe(false)
    expect(maxClinicalTokens).toBe(VGHBRAIN_CLINICAL_TOKEN_LIMIT)
  })

  it('leaves other custom endpoints on the existing truncating fit', () => {
    useAiConfigStore.setState({ openAiCompatibleProfiles: [GENERIC_PROFILE] })
    renderHook(() => useAgentChat('system', CUSTOM_OPENAI_MODEL_ID))

    const [contextLimit, consumer, fraction, allowTextTruncation, maxClinicalTokens] =
      mockUseClinicalAiInput.mock.calls[0]
    expect(contextLimit).toBe(32768)
    expect(consumer).toBe('insights')
    expect(fraction).toBe(1)
    expect(allowTextTruncation).toBe(true)
    expect(maxClinicalTokens).toBeUndefined()
  })
})
