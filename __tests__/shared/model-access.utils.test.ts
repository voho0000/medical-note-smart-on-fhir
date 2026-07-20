import { customOpenAiModelIdForProfile } from '@/src/shared/constants/ai-models.constants'
import {
  apiKeyForModel,
  hasDirectModelAccess,
  modelContextLimit,
  modelDisplayLabel,
  modelRuntimeIdentity,
} from '@/src/shared/utils/model-access.utils'

const profile = {
  enabled: true,
  baseUrl: 'https://llm.hospital.example/v1',
  modelId: 'qwen3:8b',
  apiKey: 'hospital-secret',
  contextWindowTokens: 65536,
  contextWindowSource: 'manual' as const,
}

describe('dynamic custom model access', () => {
  const dynamicModelId = customOpenAiModelIdForProfile('hospital-a')

  it('uses the resolved profile for credentials, readiness, label, and context', () => {
    expect(apiKeyForModel(dynamicModelId, {}, profile)).toBe('hospital-secret')
    expect(hasDirectModelAccess(dynamicModelId, {}, profile)).toBe(true)
    expect(modelDisplayLabel(dynamicModelId, profile)).toBe('qwen3:8b')
    expect(modelContextLimit(dynamicModelId, profile)).toBe(65536)
  })

  it('isolates the runtime by the dynamic logical id and resolved endpoint identity', () => {
    expect(modelRuntimeIdentity(dynamicModelId, profile)).toContain(
      `${dynamicModelId}:custom-`,
    )
    expect(modelRuntimeIdentity(dynamicModelId, profile)).not.toBe(
      modelRuntimeIdentity(
        customOpenAiModelIdForProfile('hospital-b'),
        { ...profile, baseUrl: 'https://llm-b.hospital.example/v1' },
      ),
    )
  })
})
