import { renderHook, waitFor } from '@testing-library/react'
import { useMedicalSummaryPeek } from '@/src/application/hooks/medical-summary/medical-summary-peek'
import {
  medicalSummaryStore,
} from '@/src/application/hooks/medical-summary/medical-summary-store'
import { patientAiSlotKey } from '@/src/application/hooks/ai-generation/ai-slot-key'
import { useAiConfigStore } from '@/src/application/stores/ai-config.store'
import { customOpenAiModelIdForProfile } from '@/src/shared/constants/ai-models.constants'
import { modelRuntimeIdentity } from '@/src/shared/utils/model-access.utils'
import type { MedicalSummaryResult } from '@/src/core/entities/medical-summary.entity'
import type { OpenAiCompatibleProfile } from '@/src/shared/types/openai-compatible.types'
import { loadEncryptedCache } from '@/src/infrastructure/cache/encrypted-session-cache'

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({ locale: 'zh-TW' }),
}))
jest.mock('@/src/application/hooks/ai-generation/use-clinical-ai-input.hook', () => ({
  useClinicalAiInput: () => ({
    patientId: 'patient-1',
    dataReady: true,
    inputSignature: 'selected-data-v1',
  }),
}))
jest.mock('@/src/infrastructure/cache/encrypted-session-cache', () => ({
  ...jest.requireActual('@/src/infrastructure/cache/encrypted-session-cache'),
  loadEncryptedCache: jest.fn(async () => null),
}))

describe('useMedicalSummaryPeek custom profile slots', () => {
  beforeEach(() => {
    jest.mocked(loadEncryptedCache).mockReset().mockResolvedValue(null)
    medicalSummaryStore.setState({ byKey: {} })
    useAiConfigStore.setState({ openAiCompatibleProfiles: [] })
  })

  it('finds a live summary owned by a dynamic custom profile', () => {
    const profile: OpenAiCompatibleProfile = {
      profileId: 'endpoint-b',
      enabled: true,
      baseUrl: 'https://endpoint-b.example/v1',
      modelId: 'upstream-b',
      apiKey: null,
    }
    const logicalModelId = customOpenAiModelIdForProfile(profile.profileId)
    const slotKey = patientAiSlotKey({
      patientId: 'patient-1',
      audience: 'medical',
      locale: 'zh-TW',
      modelId: modelRuntimeIdentity(logicalModelId, profile),
      inputSignature: 'selected-data-v1',
    })
    const summary = {
      generation: {
        source: 'live',
        modelId: logicalModelId,
        modelName: profile.modelId,
        generatedAt: Date.now(),
      },
    } as unknown as MedicalSummaryResult
    useAiConfigStore.setState({ openAiCompatibleProfiles: [profile] })
    medicalSummaryStore.setState({ byKey: { [slotKey]: summary } })

    const { result } = renderHook(() => useMedicalSummaryPeek('patient-1'))

    expect(result.current).toBe(summary)
  })

  it('hydrates the dynamic custom profile cache after reload', async () => {
    const profile: OpenAiCompatibleProfile = {
      profileId: 'endpoint-b',
      enabled: true,
      baseUrl: 'https://endpoint-b.example/v1',
      modelId: 'upstream-b',
      apiKey: null,
    }
    const logicalModelId = customOpenAiModelIdForProfile(profile.profileId)
    const summary = {
      generation: {
        source: 'live',
        modelId: logicalModelId,
        modelName: profile.modelId,
        generatedAt: Date.now(),
      },
    } as unknown as MedicalSummaryResult
    jest.mocked(loadEncryptedCache).mockImplementation(async (key) => (
      key.includes(logicalModelId) ? summary : null
    ))
    useAiConfigStore.setState({ openAiCompatibleProfiles: [profile] })

    const { result } = renderHook(() => useMedicalSummaryPeek('patient-1'))

    await waitFor(() => expect(result.current).toBe(summary))
  })
})
