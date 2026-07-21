import type { OpenAiCompatibleProfile } from '@/src/shared/types/openai-compatible.types'

let state: {
  apiKey: string | null
  geminiKey: string | null
  claudeKey: string | null
  openAiCompatibleProfiles: OpenAiCompatibleProfile[]
} = {
  apiKey: 'openai-a',
  geminiKey: 'gemini-a',
  claudeKey: 'claude-a',
  openAiCompatibleProfiles: [],
}

jest.mock('@/src/application/stores/ai-config.store', () => ({
  useAiConfigStore: {
    getState: () => state,
  },
}))

import { captureAiRuntimeConfig } from '@/src/application/composition.ai'

describe('AI composition root credential snapshots', () => {
  it('captures live keys and profiles at each request boundary', () => {
    const first = captureAiRuntimeConfig()
    const replacementProfile: OpenAiCompatibleProfile = {
      profileId: 'hospital',
      enabled: true,
      baseUrl: 'https://hospital.example/v1',
      modelId: 'hospital-model',
      apiKey: 'endpoint-key-b',
    }
    state = {
      apiKey: 'openai-b',
      geminiKey: 'gemini-b',
      claudeKey: 'claude-b',
      openAiCompatibleProfiles: [replacementProfile],
    }
    const second = captureAiRuntimeConfig()

    expect(first).toMatchObject({
      openAiApiKey: 'openai-a',
      geminiApiKey: 'gemini-a',
      claudeApiKey: 'claude-a',
      openAiCompatibleProfiles: [],
    })
    expect(second).toMatchObject({
      openAiApiKey: 'openai-b',
      geminiApiKey: 'gemini-b',
      claudeApiKey: 'claude-b',
      openAiCompatibleProfiles: [replacementProfile],
    })
  })
})
