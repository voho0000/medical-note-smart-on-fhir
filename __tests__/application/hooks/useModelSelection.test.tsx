import type { ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { useModelSelection } from '@/src/application/hooks/useModelSelection'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { useAiConfigStore } from '@/src/application/stores/ai-config.store'
import {
  CUSTOM_OPENAI_MODEL_ID,
  customOpenAiModelIdForProfile,
} from '@/src/shared/constants/ai-models.constants'

const wrapper = ({ children }: { children: ReactNode }) => (
  <LanguageProvider>{children}</LanguageProvider>
)

const profile = (
  profileId: string,
  baseUrl: string,
  modelId: string,
  enabled = true,
) => ({
  profileId,
  enabled,
  baseUrl,
  modelId,
  apiKey: null,
  transport: 'direct' as const,
  contextWindowTokens: 32768,
  contextWindowSource: 'manual' as const,
})

describe('useModelSelection custom profiles', () => {
  beforeEach(() => {
    localStorage.clear()
    useAiConfigStore.setState({
      credentialsHydrating: false,
      openAiCompatibleProfiles: [],
    })
  })

  it('lists every enabled profile and disambiguates duplicate upstream models by host', () => {
    useAiConfigStore.setState({
      openAiCompatibleProfiles: [
        profile('legacy', 'https://hospital-a.example/v1', 'qwen3:8b'),
        profile('hospital-b', 'https://hospital-b.example/v1', 'qwen3:8b'),
        profile('disabled', 'https://hospital-c.example/v1', 'llama3:8b', false),
      ],
    })
    const setModel = jest.fn()
    const { result } = renderHook(
      () => useModelSelection(null, null, null, CUSTOM_OPENAI_MODEL_ID, setModel),
      { wrapper },
    )

    expect(result.current.customModels).toEqual([
      expect.objectContaining({
        id: CUSTOM_OPENAI_MODEL_ID,
        label: 'qwen3:8b · hospital-a.example',
        isLocked: false,
      }),
      expect.objectContaining({
        id: customOpenAiModelIdForProfile('hospital-b'),
        label: 'qwen3:8b · hospital-b.example',
        isLocked: false,
      }),
    ])

    act(() => result.current.handleSelectModel(
      customOpenAiModelIdForProfile('hospital-b'),
    ))
    expect(setModel).toHaveBeenCalledWith(
      customOpenAiModelIdForProfile('hospital-b'),
    )
  })

  it('keeps one configure entry when no enabled profile is usable', () => {
    useAiConfigStore.setState({
      openAiCompatibleProfiles: [
        profile('disabled', 'https://hospital.example/v1', 'qwen3:8b', false),
      ],
    })
    const { result } = renderHook(
      () => useModelSelection(null, null, null, CUSTOM_OPENAI_MODEL_ID, jest.fn()),
      { wrapper },
    )

    expect(result.current.customModels).toEqual([
      expect.objectContaining({
        id: CUSTOM_OPENAI_MODEL_ID,
        isLocked: true,
        configureInSettings: true,
      }),
    ])
  })

  it('uses endpoint paths and stable ordinals when duplicate models share a host', () => {
    useAiConfigStore.setState({
      openAiCompatibleProfiles: [
        profile('tenant-a', 'https://gateway.example/tenant-a/v1', 'MODEL_NAME'),
        profile('tenant-b', 'https://gateway.example/tenant-b/v1', 'MODEL_NAME'),
        profile('tenant-b-2', 'https://gateway.example/tenant-b/v1', 'MODEL_NAME'),
      ],
    })
    const { result } = renderHook(
      () => useModelSelection(null, null, null, CUSTOM_OPENAI_MODEL_ID, jest.fn()),
      { wrapper },
    )

    expect(result.current.customModels.map((entry) => entry.label)).toEqual([
      'MODEL_NAME · gateway.example/tenant-a/v1',
      'MODEL_NAME · gateway.example/tenant-b/v1 #1',
      'MODEL_NAME · gateway.example/tenant-b/v1 #2',
    ])
  })
})
