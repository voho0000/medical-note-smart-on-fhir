import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ModelAndKeySettings } from '@/features/settings/components/ApiKeyField'
import {
  testOpenAiCompatibleAgentCapability,
  testOpenAiCompatibleConnection,
} from '@/src/application/composition.ai'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import type { SettingsNavigationTarget } from '@/src/application/providers/right-panel.provider'
import { useAiConfigStore } from '@/src/application/stores/ai-config.store'
import { DEFAULT_OPENAI_COMPATIBLE_CONTEXT_WINDOW } from '@/src/shared/types/openai-compatible.types'

jest.mock('@/src/application/composition.ai', () => ({
  testOpenAiCompatibleConnection: jest.fn(),
  testOpenAiCompatibleAgentCapability: jest.fn(),
}))

const mockTestOpenAiCompatibleConnection = jest.mocked(testOpenAiCompatibleConnection)
const mockTestOpenAiCompatibleAgentCapability = jest.mocked(
  testOpenAiCompatibleAgentCapability,
)

jest.mock('@/features/auth', () => ({
  AuthStatus: () => <div data-testid="auth-status">Cloud account status</div>,
}))

jest.mock('@/src/application/providers/auth.provider', () => ({
  useAuth: () => ({
    user: null,
    isAnonymous: true,
    loading: false,
  }),
}))

jest.mock('@/src/application/stores/model-prefs.store', () => ({
  useModelPrefsStore: {
    getState: () => ({
      prefs: {
        chat: 'gemini-3.1-flash-lite',
        insights: 'gemini-3.1-flash-lite',
      },
    }),
  },
}))

jest.mock('@/src/application/hooks/medical-summary/use-medical-summary.hook', () => ({
  useSummaryPrefsStore: {
    getState: () => ({ modelId: 'gemini-3.1-flash-lite' }),
  },
}))

jest.mock('@/src/application/hooks/safety-alerts/use-safety-alerts.hook', () => ({
  useSafetyPrefsStore: {
    getState: () => ({ modelId: 'gemini-3.1-flash-lite' }),
  },
}))

function renderSettings(
  offlineMode: boolean,
  navigation?: {
    settingsTarget: SettingsNavigationTarget
    onSettingsTargetHandled: () => void
  },
) {
  return render(
    <LanguageProvider>
      <ModelAndKeySettings offlineMode={offlineMode} {...navigation} />
    </LanguageProvider>,
  )
}

function setConfiguredLocalEndpoint() {
  const config = {
    enabled: true,
    baseUrl: 'http://127.0.0.1:11434/v1',
    modelId: 'qwen2.5:7b',
    apiKey: null,
    contextWindowTokens: 32768,
    contextWindowSource: 'suggested' as const,
  }
  useAiConfigStore.setState({
    apiKey: null,
    geminiKey: null,
    perplexityKey: null,
    claudeKey: null,
    storageType: 'sessionStorage',
    credentialsHydrating: false,
    storageTypeChanging: false,
    openAiCompatibleProfiles: [{ profileId: 'legacy', ...config }],
    openAiCompatible: config,
  })
}

describe('ModelAndKeySettings progressive disclosure', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    mockTestOpenAiCompatibleConnection.mockReset()
    mockTestOpenAiCompatibleAgentCapability.mockReset()
    setConfiguredLocalEndpoint()
  })

  it('keeps an offline deployment compact and removes cloud-only settings', () => {
    renderSettings(true)

    expect(screen.queryByRole('heading', { name: 'AI 連線狀態' })).not.toBeInTheDocument()
    expect(screen.getAllByText(/qwen2\.5:7b · 127\.0\.0\.1:11434/)).toHaveLength(1)
    expect(screen.getByText('純內網部署')).toBeInTheDocument()
    expect(screen.queryByText('雲端 AI')).not.toBeInTheDocument()
    expect(screen.queryByText('深入對話工具')).not.toBeInTheDocument()
    expect(screen.queryByTestId('auth-status')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/個人 OpenAI API 金鑰/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/個人 Perplexity API 金鑰/)).not.toBeInTheDocument()
  })

  it('shows each hosted connection only once instead of repeating a status overview', () => {
    renderSettings(false)

    expect(screen.queryByRole('heading', { name: 'AI 連線狀態' })).not.toBeInTheDocument()
    expect(screen.getAllByText('雲端 AI')).toHaveLength(1)
    expect(screen.getAllByText('深入對話工具')).toHaveLength(1)
    expect(screen.getAllByText(/qwen2\.5:7b · 127\.0\.0\.1:11434/)).toHaveLength(1)
  })

  it('shows all custom endpoint settings without a nested Advanced toggle', () => {
    renderSettings(true)

    const localTrigger = screen.getByRole('button', {
      name: /自訂 AI 端點/,
    })
    expect(localTrigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('textbox', { name: 'Chat Completions 網址', hidden: true })).not.toBeVisible()

    fireEvent.click(localTrigger)
    expect(screen.getByRole('textbox', { name: 'Chat Completions 網址' })).toHaveValue(
      'http://127.0.0.1:11434/v1/chat/completions',
    )
    expect(screen.getByRole('textbox', { name: 'Chat Completions 網址' })).toHaveAttribute(
      'placeholder',
      'https://llm.intra.example.org/v1/chat/completions',
    )
    expect(screen.getByRole('combobox', { name: '上游模型 ID' })).toHaveValue('qwen2.5:7b')
    expect(screen.getByRole('spinbutton', { name: '內容視窗（tokens）' })).toHaveValue(32768)
    expect(screen.getByRole('textbox', { name: 'API 金鑰（選填）' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '進階設定' })).not.toBeInTheDocument()
  })

  it('shows only the public Firebase Gateway providers', () => {
    const current = useAiConfigStore.getState().openAiCompatibleProfiles[0]!
    const gatewayProfile = {
      ...current,
      transport: 'mediprisma-gateway' as const,
    }
    useAiConfigStore.setState({
      openAiCompatibleProfiles: [gatewayProfile],
      openAiCompatible: gatewayProfile,
    })

    renderSettings(false)
    fireEvent.click(screen.getByRole('button', { name: /自訂 AI 端點/ }))

    expect(screen.getByText(
      '支援 NVIDIA、OpenRouter、Cerebras',
    )).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Chat Completions 網址' }))
      .toHaveAttribute(
        'placeholder',
        'https://openrouter.ai/api/v1/chat/completions',
      )
    expect(screen.queryByText(/j3soon/i)).not.toBeInTheDocument()
  })

  it('reveals, scrolls to, and focuses a context-window navigation target', async () => {
    const onSettingsTargetHandled = jest.fn()
    const scrollIntoView = jest.fn()
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    try {
      renderSettings(true, {
        settingsTarget: 'openai-compatible-context-window',
        onSettingsTargetHandled,
      })

      const contextInput = await screen.findByRole('spinbutton', {
        name: '內容視窗（tokens）',
      })
      await waitFor(() => expect(contextInput).toHaveFocus())
      expect(screen.getByRole('button', { name: /自訂 AI 端點/ })).toHaveAttribute(
        'aria-expanded',
        'true',
      )
      expect(screen.queryByRole('button', { name: '進階設定' })).not.toBeInTheDocument()
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' })
      expect(onSettingsTargetHandled).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: originalScrollIntoView,
      })
    }
  })

  it('opens the exact custom profile named by a context-window target', async () => {
    const legacy = useAiConfigStore.getState().openAiCompatibleProfiles[0]!
    const second = {
      ...legacy,
      profileId: 'profile-2',
      baseUrl: 'https://llama.intra.example/v1',
      modelId: 'hospital-llama',
      contextWindowTokens: 65536,
    }
    useAiConfigStore.setState({
      openAiCompatibleProfiles: [legacy, second],
      openAiCompatible: legacy,
    })

    renderSettings(true, {
      settingsTarget: {
        kind: 'openai-compatible-context-window',
        profileId: 'profile-2',
      },
      onSettingsTargetHandled: jest.fn(),
    })

    const contextInput = await screen.findByRole('spinbutton', {
      name: '內容視窗（tokens）',
    })
    await waitFor(() => expect(contextInput).toHaveValue(65536))
    expect(screen.getByRole('combobox', {
      name: '選擇要編輯的模型',
    })).toHaveValue('profile-2')
  })

  it('opens a blank custom-model form from the model-picker add target', async () => {
    const onSettingsTargetHandled = jest.fn()

    renderSettings(true, {
      settingsTarget: 'openai-compatible-add-profile',
      onSettingsTargetHandled,
    })

    expect(await screen.findByRole('button', { name: /自訂 AI 端點/ }))
      .toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => {
      expect(screen.getByRole('textbox', {
        name: 'Chat Completions 網址',
      })).toHaveValue('')
      expect(screen.getByRole('combobox', {
        name: '上游模型 ID',
      })).toHaveValue('')
    })
    expect(screen.getByRole('combobox', {
      name: '選擇要編輯的模型',
    })).toHaveValue('')
    expect(onSettingsTargetHandled).toHaveBeenCalledTimes(1)
  })

  it('locks endpoint and cloud credential controls until browser settings finish loading', () => {
    useAiConfigStore.setState({ credentialsHydrating: true })
    renderSettings(false)

    fireEvent.click(screen.getByRole('button', { name: /自訂 AI 端點/ }))
    const endpointInput = screen.getByRole('textbox', { name: 'Chat Completions 網址' })
    expect(endpointInput).toBeDisabled()
    expect(screen.getByRole('button', { name: '測試連線' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /儲存/ })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /隱私與裝置保存/ }))
    expect(screen.getByRole('switch', {
      name: '在此裝置記住雲端 AI 與工具金鑰',
    })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /^雲端 AI 0 \/ 3/ }))
    fireEvent.click(screen.getByRole('button', { name: 'OpenAI 未設定' }))
    const cloudKeyInput = screen.getByLabelText(/個人 OpenAI API 金鑰/)
    expect(cloudKeyInput).toBeDisabled()

    act(() => useAiConfigStore.setState({ credentialsHydrating: false }))
    expect(endpointInput).toBeEnabled()
    expect(cloudKeyInput).toBeEnabled()
  })

  it('selects a saved profile when encrypted settings finish hydrating', async () => {
    useAiConfigStore.setState({
      credentialsHydrating: true,
      openAiCompatibleProfiles: [],
      openAiCompatible: {
        enabled: false,
        baseUrl: '',
        modelId: '',
        apiKey: null,
        contextWindowTokens: DEFAULT_OPENAI_COMPATIBLE_CONTEXT_WINDOW,
        contextWindowSource: 'suggested',
      },
    })
    renderSettings(true)

    const hydrated = {
      profileId: 'legacy',
      enabled: true,
      baseUrl: 'https://hydrated.intra.example/v1',
      modelId: 'hydrated-model',
      apiKey: 'secret-after-hydration',
      contextWindowTokens: 65536,
      contextWindowSource: 'manual' as const,
      transport: 'direct' as const,
    }
    act(() => useAiConfigStore.setState({
      credentialsHydrating: false,
      openAiCompatibleProfiles: [hydrated],
      openAiCompatible: hydrated,
    }))

    await waitFor(() => {
      expect(screen.getByRole('combobox', {
        name: '選擇要編輯的模型',
      })).toHaveValue('legacy')
    })
    expect(screen.getByRole('textbox', { name: 'Chat Completions 網址' })).toHaveValue(
      'https://hydrated.intra.example/v1/chat/completions',
    )
  })

  it('opens an unconfigured local profile and distinguishes a disabled saved profile', () => {
    useAiConfigStore.setState({
      openAiCompatibleProfiles: [],
      openAiCompatible: {
        enabled: false,
        baseUrl: '',
        modelId: '',
        apiKey: null,
        contextWindowTokens: DEFAULT_OPENAI_COMPATIBLE_CONTEXT_WINDOW,
        contextWindowSource: 'suggested',
      },
    })
    const { unmount } = renderSettings(true)
    expect(screen.getByRole('button', { name: /自訂 AI 端點/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    unmount()

    const disabledConfig = {
      enabled: false,
      baseUrl: 'https://llm.intra.example/v1',
      modelId: 'qwen3:8b',
      apiKey: null,
      contextWindowTokens: 40960,
      contextWindowSource: 'manual' as const,
    }
    useAiConfigStore.setState({
      openAiCompatibleProfiles: [{ profileId: 'legacy', ...disabledConfig }],
      openAiCompatible: disabledConfig,
    })
    renderSettings(true)
    expect(screen.getAllByText('已停用').length).toBeGreaterThan(0)
    expect(screen.queryByText('尚未設定端點')).not.toBeInTheDocument()
  })

  it('starts a new endpoint at 32,768 and applies known model suggestions until edited', () => {
    useAiConfigStore.setState({
      openAiCompatibleProfiles: [],
      openAiCompatible: {
        enabled: false,
        baseUrl: '',
        modelId: '',
        apiKey: null,
        contextWindowTokens: DEFAULT_OPENAI_COMPATIBLE_CONTEXT_WINDOW,
        contextWindowSource: 'suggested',
      },
    })
    renderSettings(true)

    const contextInput = screen.getByRole('spinbutton', {
      name: '內容視窗（tokens）',
    })
    expect(contextInput).toHaveValue(32768)

    fireEvent.change(screen.getByRole('combobox', { name: '上游模型 ID' }), {
      target: { value: 'qwen2.5vl:7b' },
    })
    expect(contextInput).toHaveValue(128000)

    fireEvent.change(contextInput, { target: { value: '64000' } })
    fireEvent.change(screen.getByRole('combobox', { name: '上游模型 ID' }), {
      target: { value: 'qwen3:8b' },
    })
    expect(contextInput).toHaveValue(64000)
  })

  it('preserves an unsaved endpoint draft when the outer section is collapsed', () => {
    renderSettings(true)

    const localTrigger = screen.getByRole('button', {
      name: /自訂 AI 端點/,
    })
    fireEvent.click(localTrigger)
    const endpointInput = screen.getByRole('textbox', { name: 'Chat Completions 網址' })
    fireEvent.change(endpointInput, {
      target: { value: 'https://new.intra.example/v1/chat/completions' },
    })

    fireEvent.click(localTrigger)
    fireEvent.click(localTrigger)
    expect(screen.getByRole('textbox', { name: 'Chat Completions 網址' })).toHaveValue(
      'https://new.intra.example/v1/chat/completions',
    )
  })

  it('requires a successful test after connection fields change, but not after a local window override', async () => {
    mockTestOpenAiCompatibleConnection.mockResolvedValue({
      models: ['qwen3:8b'],
      modelFound: true,
      usedChatProbe: false,
      detectedContextWindowTokens: 40960,
    })
    renderSettings(true)

    fireEvent.click(screen.getByRole('button', { name: /自訂 AI 端點/ }))
    const saveButton = screen.getByRole('button', { name: /儲存/ })
    expect(saveButton).toBeEnabled()

    fireEvent.change(screen.getByRole('combobox', { name: '上游模型 ID' }), {
      target: { value: 'qwen3:8b' },
    })
    expect(saveButton).toBeDisabled()
    expect(saveButton).toHaveAttribute('title', '請先成功測試連線，再儲存設定。')

    fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
    await waitFor(() => expect(saveButton).toBeEnabled())

    const contextInput = await screen.findByRole('spinbutton', {
      name: '內容視窗（tokens）',
    })
    fireEvent.change(contextInput, { target: { value: '65536' } })
    expect(saveButton).toBeEnabled()
    expect(screen.getByText('連線成功，模型清單端點回應正常。')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'Chat Completions 網址' }), {
      target: { value: 'https://other.intra.example/v1/chat/completions' },
    })
    expect(saveButton).toBeDisabled()
  })

  it('checks Agent support and automatically saves a verified result', async () => {
    mockTestOpenAiCompatibleAgentCapability.mockResolvedValue({ status: 'verified' })
    renderSettings(true)

    fireEvent.click(screen.getByRole('button', { name: /自訂 AI 端點/ }))
    expect(screen.getByRole('radio', { name: '自動偵測' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '標準對話' })).not.toBeChecked()
    expect(screen.queryByRole('radio', { name: '深入對話' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Agent 能力: 未驗證')).toBeInTheDocument()

    const agentTestButton = screen.getByRole('button', { name: '檢查 Agent 支援' })
    expect(agentTestButton).toBeEnabled()
    fireEvent.click(agentTestButton)

    await screen.findByText('支援 Agent 深入模式，已自動儲存。')
    expect(screen.getByLabelText('Agent 能力: 已驗證')).toBeInTheDocument()
    expect(mockTestOpenAiCompatibleAgentCapability).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'qwen2.5:7b',
        agentMode: 'auto',
        agentCapability: 'unknown',
        agentCapabilityTestedAt: null,
      }),
    )

    await waitFor(() => {
      expect(useAiConfigStore.getState().openAiCompatible).toEqual(
        expect.objectContaining({
          agentMode: 'auto',
          agentCapability: 'verified',
          agentCapabilityTestedAt: expect.any(Number),
        }),
      )
    })
  })

  it('does not re-enable a disabled profile while saving its Agent result', async () => {
    const current = useAiConfigStore.getState().openAiCompatibleProfiles[0]!
    const disabled = { ...current, enabled: false }
    useAiConfigStore.setState({
      openAiCompatibleProfiles: [disabled],
      openAiCompatible: disabled,
    })
    mockTestOpenAiCompatibleAgentCapability.mockResolvedValue({ status: 'verified' })
    renderSettings(true)

    fireEvent.click(screen.getByRole('button', { name: /自訂 AI 端點/ }))
    fireEvent.click(screen.getByRole('button', { name: '檢查 Agent 支援' }))

    await waitFor(() => {
      expect(useAiConfigStore.getState().openAiCompatibleProfiles[0]).toEqual(
        expect.objectContaining({
          enabled: false,
          agentCapability: 'verified',
          agentCapabilityTestedAt: expect.any(Number),
        }),
      )
    })
  })

  it('records an unsupported Agent result and allows an explicit standard-chat policy', async () => {
    mockTestOpenAiCompatibleAgentCapability.mockResolvedValue({
      status: 'unsupported',
      reason: 'tools are not accepted',
    })
    renderSettings(true)

    fireEvent.click(screen.getByRole('button', { name: /自訂 AI 端點/ }))
    fireEvent.click(screen.getByRole('button', { name: '檢查 Agent 支援' }))

    await screen.findByText('未通過深入模式驗證，結果已自動儲存。')
    expect(screen.getByText('檢測詳細資訊: tools are not accepted')).toBeInTheDocument()
    expect(screen.getByLabelText('Agent 能力: 未通過深入模式驗證')).toBeInTheDocument()
    await waitFor(() => {
      expect(useAiConfigStore.getState().openAiCompatible).toEqual(
        expect.objectContaining({
          agentMode: 'auto',
          agentCapability: 'unsupported',
          agentCapabilityTestedAt: expect.any(Number),
        }),
      )
    })
    fireEvent.click(screen.getByRole('radio', { name: '標準對話' }))
    fireEvent.click(screen.getByRole('button', { name: /儲存/ }))

    await waitFor(() => {
      expect(useAiConfigStore.getState().openAiCompatible).toEqual(
        expect.objectContaining({
          agentMode: 'standard',
          agentCapability: 'unsupported',
          agentCapabilityTestedAt: expect.any(Number),
        }),
      )
    })
  })

  it('keeps the saved Agent result when a new check is inconclusive', async () => {
    const current = useAiConfigStore.getState().openAiCompatibleProfiles[0]!
    const verified = {
      ...current,
      agentMode: 'auto' as const,
      agentCapability: 'verified' as const,
      agentCapabilityTestedAt: 1_721_500_000_000,
    }
    useAiConfigStore.setState({
      openAiCompatibleProfiles: [verified],
      openAiCompatible: verified,
    })
    mockTestOpenAiCompatibleAgentCapability.mockResolvedValue({
      status: 'inconclusive',
      reason: 'request timed out',
    })
    renderSettings(true)

    fireEvent.click(screen.getByRole('button', { name: /自訂 AI 端點/ }))
    fireEvent.click(screen.getByRole('button', { name: '檢查 Agent 支援' }))

    await screen.findByText('暫時無法完成深入模式驗證；已保留原本設定。')
    expect(screen.getByText('檢測詳細資訊: request timed out')).toBeInTheDocument()
    expect(screen.getByLabelText('Agent 能力: 已驗證')).toBeInTheDocument()
    expect(useAiConfigStore.getState().openAiCompatibleProfiles[0]).toEqual(verified)
  })

  it('invalidates Agent verification when a connection identity field changes', async () => {
    const current = useAiConfigStore.getState().openAiCompatibleProfiles[0]!
    const verified = {
      ...current,
      agentMode: 'auto' as const,
      agentCapability: 'verified' as const,
      agentCapabilityTestedAt: 1_721_500_000_000,
    }
    useAiConfigStore.setState({
      openAiCompatibleProfiles: [verified],
      openAiCompatible: verified,
    })
    mockTestOpenAiCompatibleConnection.mockResolvedValue({
      models: ['qwen3:8b'],
      modelFound: true,
      usedChatProbe: false,
      detectedContextWindowTokens: null,
    })
    renderSettings(true)

    fireEvent.click(screen.getByRole('button', { name: /自訂 AI 端點/ }))
    expect(screen.getByLabelText('Agent 能力: 已驗證')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: '上游模型 ID' }), {
      target: { value: 'qwen3:8b' },
    })
    expect(screen.getByRole('radio', { name: '自動偵測' })).toBeChecked()
    expect(screen.queryByRole('radio', { name: '深入對話' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Agent 能力: 未驗證')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '檢查 Agent 支援' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '檢查 Agent 支援' })).toBeEnabled()
    })
    fireEvent.click(screen.getByRole('button', { name: /儲存/ }))
    await waitFor(() => {
      expect(useAiConfigStore.getState().openAiCompatible).toEqual(
        expect.objectContaining({
          modelId: 'qwen3:8b',
          agentMode: 'auto',
          agentCapability: 'unknown',
          agentCapabilityTestedAt: null,
        }),
      )
    })
  })

  it('saves a fresh Agent result when the clock matches the previous timestamp', async () => {
    const testedAt = 1_721_500_000_000
    const current = useAiConfigStore.getState().openAiCompatibleProfiles[0]!
    const verified = {
      ...current,
      agentMode: 'auto' as const,
      agentCapability: 'verified' as const,
      agentCapabilityTestedAt: testedAt,
    }
    useAiConfigStore.setState({
      openAiCompatibleProfiles: [verified],
      openAiCompatible: verified,
    })
    mockTestOpenAiCompatibleConnection.mockResolvedValue({
      models: ['qwen3:8b'],
      modelFound: true,
      usedChatProbe: false,
      detectedContextWindowTokens: null,
    })
    mockTestOpenAiCompatibleAgentCapability.mockResolvedValue({ status: 'verified' })
    const now = jest.spyOn(Date, 'now').mockReturnValue(testedAt)

    try {
      renderSettings(true)
      fireEvent.click(screen.getByRole('button', { name: /自訂 AI 端點/ }))
      fireEvent.change(screen.getByRole('combobox', { name: '上游模型 ID' }), {
        target: { value: 'qwen3:8b' },
      })
      fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
      const agentTestButton = screen.getByRole('button', { name: '檢查 Agent 支援' })
      await waitFor(() => expect(agentTestButton).toBeEnabled())
      fireEvent.click(agentTestButton)

      await waitFor(() => {
        expect(useAiConfigStore.getState().openAiCompatibleProfiles[0]).toEqual(
          expect.objectContaining({
            modelId: 'qwen3:8b',
            agentCapability: 'verified',
            agentCapabilityTestedAt: testedAt + 1,
          }),
        )
      })
    } finally {
      now.mockRestore()
    }
  })

  it('preserves an explicit standard-chat policy selected for an edited connection', async () => {
    const current = useAiConfigStore.getState().openAiCompatibleProfiles[0]!
    const verified = {
      ...current,
      agentMode: 'auto' as const,
      agentCapability: 'verified' as const,
      agentCapabilityTestedAt: 1_721_500_000_000,
    }
    useAiConfigStore.setState({
      openAiCompatibleProfiles: [verified],
      openAiCompatible: verified,
    })
    mockTestOpenAiCompatibleConnection.mockResolvedValue({
      models: ['qwen3:8b'],
      modelFound: true,
      usedChatProbe: false,
      detectedContextWindowTokens: null,
    })
    renderSettings(true)

    fireEvent.click(screen.getByRole('button', { name: /自訂 AI 端點/ }))
    fireEvent.change(screen.getByRole('combobox', { name: '上游模型 ID' }), {
      target: { value: 'qwen3:8b' },
    })
    expect(screen.getByRole('radio', { name: '自動偵測' })).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '檢查 Agent 支援' })).toBeEnabled()
    })
    fireEvent.click(screen.getByRole('radio', { name: '標準對話' }))
    fireEvent.click(screen.getByRole('button', { name: /儲存/ }))

    await waitFor(() => {
      expect(useAiConfigStore.getState().openAiCompatible).toEqual(
        expect.objectContaining({
          modelId: 'qwen3:8b',
          agentMode: 'standard',
          agentCapability: 'unknown',
          agentCapabilityTestedAt: null,
        }),
      )
    })
  })

  it('keeps a new connection profile unsaveable until its test succeeds', async () => {
    useAiConfigStore.setState({
      openAiCompatibleProfiles: [],
      openAiCompatible: {
        enabled: false,
        baseUrl: '',
        modelId: '',
        apiKey: null,
        contextWindowTokens: DEFAULT_OPENAI_COMPATIBLE_CONTEXT_WINDOW,
        contextWindowSource: 'suggested',
      },
    })
    mockTestOpenAiCompatibleConnection.mockResolvedValue({
      models: [],
      modelFound: null,
      usedChatProbe: true,
      detectedContextWindowTokens: null,
    })
    renderSettings(true)

    fireEvent.change(screen.getByRole('textbox', { name: 'Chat Completions 網址' }), {
      target: { value: 'https://new.intra.example/v1/chat/completions' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: '上游模型 ID' }), {
      target: { value: 'hospital-model' },
    })
    const saveButton = screen.getByRole('button', { name: '儲存並啟用' })
    const agentTestButton = screen.getByRole('button', { name: '檢查 Agent 支援' })
    expect(saveButton).toBeDisabled()
    expect(agentTestButton).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
    await waitFor(() => {
      expect(saveButton).toBeEnabled()
      expect(agentTestButton).toBeEnabled()
    })
  })

  it('creates a new profile as soon as Agent support is confirmed', async () => {
    useAiConfigStore.setState({
      openAiCompatibleProfiles: [],
      openAiCompatible: {
        enabled: false,
        baseUrl: '',
        modelId: '',
        apiKey: null,
        contextWindowTokens: DEFAULT_OPENAI_COMPATIBLE_CONTEXT_WINDOW,
        contextWindowSource: 'suggested',
      },
    })
    mockTestOpenAiCompatibleConnection.mockResolvedValue({
      models: [],
      modelFound: null,
      usedChatProbe: true,
      detectedContextWindowTokens: null,
    })
    mockTestOpenAiCompatibleAgentCapability.mockResolvedValue({ status: 'verified' })
    renderSettings(true)

    fireEvent.change(screen.getByRole('textbox', { name: 'Chat Completions 網址' }), {
      target: { value: 'https://new.intra.example/v1/chat/completions' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: '上游模型 ID' }), {
      target: { value: 'hospital-agent' },
    })
    fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
    const agentTestButton = screen.getByRole('button', { name: '檢查 Agent 支援' })
    await waitFor(() => expect(agentTestButton).toBeEnabled())
    fireEvent.click(agentTestButton)

    await screen.findByText('支援 Agent 深入模式，已自動儲存。')
    await waitFor(() => {
      expect(useAiConfigStore.getState().openAiCompatibleProfiles).toEqual([
        expect.objectContaining({
          enabled: true,
          modelId: 'hospital-agent',
          agentMode: 'auto',
          agentCapability: 'verified',
          agentCapabilityTestedAt: expect.any(Number),
        }),
      ])
    })
  })

  it('does not create a new profile when Agent support cannot be confirmed', async () => {
    useAiConfigStore.setState({
      openAiCompatibleProfiles: [],
      openAiCompatible: {
        enabled: false,
        baseUrl: '',
        modelId: '',
        apiKey: null,
        contextWindowTokens: DEFAULT_OPENAI_COMPATIBLE_CONTEXT_WINDOW,
        contextWindowSource: 'suggested',
      },
    })
    mockTestOpenAiCompatibleConnection.mockResolvedValue({
      models: [],
      modelFound: null,
      usedChatProbe: true,
      detectedContextWindowTokens: null,
    })
    mockTestOpenAiCompatibleAgentCapability.mockResolvedValue({
      status: 'inconclusive',
      reason: 'request timed out',
    })
    renderSettings(true)

    fireEvent.change(screen.getByRole('textbox', { name: 'Chat Completions 網址' }), {
      target: { value: 'https://new.intra.example/v1/chat/completions' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: '上游模型 ID' }), {
      target: { value: 'hospital-agent' },
    })
    fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
    const agentTestButton = screen.getByRole('button', { name: '檢查 Agent 支援' })
    await waitFor(() => expect(agentTestButton).toBeEnabled())
    fireEvent.click(agentTestButton)

    await screen.findByText('暫時無法完成深入模式驗證；已保留原本設定。')
    expect(screen.getByText('檢測詳細資訊: request timed out')).toBeInTheDocument()
    expect(useAiConfigStore.getState().openAiCompatibleProfiles).toHaveLength(0)
  })

  it('adds another custom model without replacing the first and can delete it', async () => {
    mockTestOpenAiCompatibleConnection.mockResolvedValue({
      models: ['hospital-llama'],
      modelFound: true,
      usedChatProbe: false,
      detectedContextWindowTokens: 65536,
    })
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false)
    renderSettings(true)

    fireEvent.click(screen.getByRole('button', { name: /自訂 AI 端點/ }))
    fireEvent.click(screen.getByRole('button', { name: '新增模型' }))
    expect(screen.getByRole('textbox', { name: 'Chat Completions 網址' })).toHaveValue('')

    fireEvent.change(screen.getByRole('textbox', { name: 'Chat Completions 網址' }), {
      target: { value: 'https://llama.intra.example/v1/chat/completions' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: '上游模型 ID' }), {
      target: { value: 'hospital-llama' },
    })
    fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
    const saveButton = screen.getByRole('button', { name: '儲存並啟用' })
    await waitFor(() => expect(saveButton).toBeEnabled())
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(useAiConfigStore.getState().openAiCompatibleProfiles).toHaveLength(2)
    })
    expect(useAiConfigStore.getState().openAiCompatibleProfiles.map((profile) => (
      profile.modelId
    ))).toEqual(['qwen2.5:7b', 'hospital-llama'])
    expect(screen.getByText('已儲存 2 / 10')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '移除' }))
    expect(useAiConfigStore.getState().openAiCompatibleProfiles).toHaveLength(2)
    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: '移除' }))
    await waitFor(() => {
      expect(useAiConfigStore.getState().openAiCompatibleProfiles).toHaveLength(1)
    })
    expect(useAiConfigStore.getState().openAiCompatibleProfiles[0].modelId).toBe('qwen2.5:7b')
    expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining(
      'hospital-llama · llama.intra.example/v1',
    ))
    confirm.mockRestore()
  })

  it('guards unsaved profile switches and re-masks each profile API key', () => {
    const first = {
      ...useAiConfigStore.getState().openAiCompatibleProfiles[0]!,
      apiKey: 'first-secret',
    }
    const second = {
      ...first,
      profileId: 'profile-2',
      baseUrl: 'https://second.intra.example/v1',
      modelId: 'second-model',
      apiKey: 'second-secret',
    }
    useAiConfigStore.setState({
      openAiCompatibleProfiles: [first, second],
      openAiCompatible: first,
    })
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false)
    renderSettings(true)
    fireEvent.click(screen.getByRole('button', { name: /自訂 AI 端點/ }))
    const profileSelect = screen.getByRole('combobox', {
      name: '選擇要編輯的模型',
    })
    const endpointInput = screen.getByRole('textbox', { name: 'Chat Completions 網址' })
    fireEvent.change(endpointInput, {
      target: { value: 'https://unsaved.intra.example/v1/chat/completions' },
    })
    fireEvent.change(profileSelect, { target: { value: 'profile-2' } })
    expect(profileSelect).toHaveValue('legacy')
    expect(endpointInput).toHaveValue('https://unsaved.intra.example/v1/chat/completions')

    confirm.mockReturnValue(true)
    fireEvent.change(profileSelect, { target: { value: 'profile-2' } })
    expect(profileSelect).toHaveValue('profile-2')
    const apiKeyInput = screen.getByRole('textbox', { name: 'API 金鑰（選填）' })
    expect(apiKeyInput).toHaveValue('second-secret')
    expect(apiKeyInput.className).toContain('[-webkit-text-security:disc]')
    fireEvent.click(screen.getByRole('button', { name: '顯示 API 金鑰' }))
    expect(screen.getByRole('button', { name: '隱藏 API 金鑰' })).toBeInTheDocument()

    fireEvent.change(profileSelect, { target: { value: 'legacy' } })
    expect(screen.getByRole('button', { name: '顯示 API 金鑰' })).toBeInTheDocument()
    expect(apiKeyInput.className).toContain('[-webkit-text-security:disc]')
    confirm.mockRestore()
  })

  it('isolates connection-test state and enabled state by profile', async () => {
    const first = useAiConfigStore.getState().openAiCompatibleProfiles[0]!
    const second = {
      ...first,
      profileId: 'profile-2',
      baseUrl: 'https://second.intra.example/v1',
      modelId: 'second-model',
    }
    useAiConfigStore.setState({
      openAiCompatibleProfiles: [first, second],
      openAiCompatible: first,
    })
    mockTestOpenAiCompatibleConnection.mockResolvedValue({
      models: [first.modelId],
      modelFound: true,
      usedChatProbe: false,
      detectedContextWindowTokens: null,
    })
    renderSettings(true)
    fireEvent.click(screen.getByRole('button', { name: /自訂 AI 端點/ }))
    fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
    await screen.findByText(/連線成功，模型清單端點回應正常/)

    const profileSelect = screen.getByRole('combobox', {
      name: '選擇要編輯的模型',
    })
    fireEvent.change(profileSelect, { target: { value: 'profile-2' } })
    expect(screen.queryByText(/連線成功，模型清單端點回應正常/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch', { name: '啟用' }))
    await waitFor(() => {
      expect(useAiConfigStore.getState().openAiCompatibleProfiles).toEqual([
        expect.objectContaining({ profileId: 'legacy', enabled: true }),
        expect.objectContaining({ profileId: 'profile-2', enabled: false }),
      ])
    })
    expect(profileSelect).toHaveValue('profile-2')
    expect(screen.getByRole('switch', { name: '啟用' })).not.toBeChecked()
  })

  it('does not discard an unsaved profile draft when enable is toggled without confirmation', () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false)
    renderSettings(true)
    fireEvent.click(screen.getByRole('button', { name: /自訂 AI 端點/ }))
    const endpointInput = screen.getByRole('textbox', { name: 'Chat Completions 網址' })
    fireEvent.change(endpointInput, {
      target: { value: 'https://unsaved.intra.example/v1/chat/completions' },
    })

    fireEvent.click(screen.getByRole('switch', { name: '啟用' }))

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('尚未儲存'))
    expect(endpointInput).toHaveValue('https://unsaved.intra.example/v1/chat/completions')
    expect(useAiConfigStore.getState().openAiCompatibleProfiles[0]).toEqual(
      expect.objectContaining({ enabled: true }),
    )
    expect(screen.getByRole('switch', { name: '啟用' })).toBeChecked()
    confirm.mockRestore()
  })

  it('caps custom models at ten', () => {
    const profiles = Array.from({ length: 10 }, (_, index) => ({
      profileId: index === 0 ? 'legacy' : `profile-${index}`,
      enabled: true,
      baseUrl: `https://model-${index}.intra.example/v1`,
      modelId: `model-${index}`,
      apiKey: null,
      contextWindowTokens: 32768,
      contextWindowSource: 'manual' as const,
      transport: 'direct' as const,
    }))
    useAiConfigStore.setState({
      openAiCompatibleProfiles: profiles,
      openAiCompatible: profiles[0],
    })
    renderSettings(true)

    fireEvent.click(screen.getByRole('button', { name: /自訂 AI 端點/ }))
    expect(screen.getByText('已儲存 10 / 10')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新增模型' })).toBeDisabled()
  })

  it('does not treat a missing model warning as a successful connection test', async () => {
    mockTestOpenAiCompatibleConnection.mockResolvedValue({
      models: ['qwen2.5:7b'],
      modelFound: false,
      usedChatProbe: false,
      detectedContextWindowTokens: null,
    })
    renderSettings(true)

    fireEvent.click(screen.getByRole('button', { name: /自訂 AI 端點/ }))
    fireEvent.change(screen.getByRole('combobox', { name: '上游模型 ID' }), {
      target: { value: 'missing-model' },
    })
    const saveButton = screen.getByRole('button', { name: /儲存/ })
    fireEvent.click(screen.getByRole('button', { name: '測試連線' }))

    await screen.findByText(/清單中沒有此模型 ID/)
    expect(saveButton).toBeDisabled()
  })

  it('auto-fills a runtime context window, then lets the user override and save it', async () => {
    mockTestOpenAiCompatibleConnection
      .mockResolvedValueOnce({
        models: ['qwen2.5:7b'],
        modelFound: true,
        usedChatProbe: false,
        detectedContextWindowTokens: 262144,
      })
      .mockResolvedValueOnce({
        models: ['qwen2.5:7b'],
        modelFound: true,
        usedChatProbe: false,
        detectedContextWindowTokens: 131072,
      })
    renderSettings(true)

    fireEvent.click(screen.getByRole('button', { name: /自訂 AI 端點/ }))
    fireEvent.click(screen.getByRole('button', { name: '測試連線' }))

    const contextInput = await screen.findByRole('spinbutton', {
      name: '內容視窗（tokens）',
    })
    await waitFor(() => expect(contextInput).toHaveValue(262144))
    expect(useAiConfigStore.getState().openAiCompatible.contextWindowTokens).toBe(32768)
    expect(screen.getByText(/端點回報 262,144 tokens/)).toBeInTheDocument()

    fireEvent.change(contextInput, { target: { value: '65536' } })
    expect(contextInput).toHaveValue(65536)
    expect(screen.getByRole('button', { name: '套用偵測值' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
    await waitFor(() => {
      expect(screen.getByText(/端點回報 131,072 tokens/)).toBeInTheDocument()
    })
    expect(contextInput).toHaveValue(65536)

    fireEvent.click(screen.getByRole('button', { name: '儲存並啟用' }))
    await waitFor(() => {
      expect(useAiConfigStore.getState().openAiCompatible.contextWindowTokens).toBe(65536)
    })
    expect(useAiConfigStore.getState().openAiCompatible.contextWindowSource).toBe('manual')
    expect(JSON.parse(localStorage.getItem('openai_compatible_connections_v2') ?? '{}'))
      .toMatchObject({
        profiles: [{
          profile: { contextWindowTokens: 65536, contextWindowSource: 'manual' },
        }],
      })
    expect(sessionStorage.getItem('openai_compatible_config')).toBeNull()
  })

  it('saves an accepted auto-detected value with detected provenance', async () => {
    mockTestOpenAiCompatibleConnection.mockResolvedValue({
      models: ['qwen2.5:7b'],
      modelFound: true,
      usedChatProbe: false,
      detectedContextWindowTokens: 262144,
    })
    renderSettings(true)

    fireEvent.click(screen.getByRole('button', { name: /自訂 AI 端點/ }))
    fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
    const contextInput = await screen.findByRole('spinbutton', {
      name: '內容視窗（tokens）',
    })
    await waitFor(() => expect(contextInput).toHaveValue(262144))
    fireEvent.click(screen.getByRole('button', { name: '儲存並啟用' }))

    await waitFor(() => {
      expect(useAiConfigStore.getState().openAiCompatible).toMatchObject({
        contextWindowTokens: 262144,
        contextWindowSource: 'detected',
      })
    })
  })

  it('does not overwrite a saved manual context window during connection testing', async () => {
    const manualConfig = {
      ...useAiConfigStore.getState().openAiCompatible,
      contextWindowTokens: 32768,
      contextWindowSource: 'manual' as const,
    }
    useAiConfigStore.setState({
      openAiCompatibleProfiles: [{ profileId: 'legacy', ...manualConfig }],
      openAiCompatible: manualConfig,
    })
    mockTestOpenAiCompatibleConnection.mockResolvedValue({
      models: ['qwen2.5:7b'],
      modelFound: true,
      usedChatProbe: false,
      detectedContextWindowTokens: 262144,
    })
    renderSettings(true)

    fireEvent.click(screen.getByRole('button', { name: /自訂 AI 端點/ }))
    fireEvent.click(screen.getByRole('button', { name: '測試連線' }))

    const contextInput = await screen.findByRole('spinbutton', {
      name: '內容視窗（tokens）',
    })
    await waitFor(() => expect(screen.getByText(/端點回報 262,144 tokens/)).toBeInTheDocument())
    expect(contextInput).toHaveValue(32768)

    fireEvent.click(screen.getByRole('button', { name: '套用偵測值' }))
    expect(contextInput).toHaveValue(262144)

    fireEvent.change(screen.getByRole('combobox', { name: '上游模型 ID' }), {
      target: { value: 'qwen3:8b' },
    })
    expect(contextInput).toHaveValue(40960)
  })

  it('keeps the editable value when the endpoint does not report a runtime window', async () => {
    mockTestOpenAiCompatibleConnection.mockResolvedValue({
      models: ['qwen2.5:7b'],
      modelFound: true,
      usedChatProbe: false,
      detectedContextWindowTokens: null,
    })
    renderSettings(true)

    fireEvent.click(screen.getByRole('button', { name: /自訂 AI 端點/ }))
    const contextInput = screen.getByRole('spinbutton', { name: '內容視窗（tokens）' })
    fireEvent.change(contextInput, { target: { value: '65536' } })
    fireEvent.click(screen.getByRole('button', { name: '測試連線' }))

    await waitFor(() => {
      expect(screen.getByText(/端點未回報實際內容視窗/)).toBeInTheDocument()
    })
    expect(contextInput).toHaveValue(65536)
  })

  it('ignores a stale connection result after the profile is cleared', async () => {
    let resolveConnection!: (
      value: Awaited<ReturnType<typeof testOpenAiCompatibleConnection>>,
    ) => void
    mockTestOpenAiCompatibleConnection.mockImplementation(() => new Promise((resolve) => {
      resolveConnection = resolve
    }))
    renderSettings(true)

    fireEvent.click(screen.getByRole('button', { name: /自訂 AI 端點/ }))
    fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
    expect(screen.getByRole('button', { name: '儲存' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '移除' })).toBeDisabled()

    act(() => useAiConfigStore.getState().clearOpenAiCompatibleConfig())
    await act(async () => {
      resolveConnection({
        models: ['qwen2.5:7b'],
        modelFound: true,
        usedChatProbe: false,
        detectedContextWindowTokens: 262144,
      })
    })

    expect(screen.getByRole('textbox', { name: 'Chat Completions 網址' })).toHaveValue('')
    expect(screen.queryByText(/端點回報 262,144 tokens/)).not.toBeInTheDocument()
    expect(screen.queryByText('連線成功，模型清單端點回應正常。')).not.toBeInTheDocument()
  })

  it('does not restore Agent trust from a stale check after profiles are cleared', async () => {
    let resolveAgentCheck!: (
      value: Awaited<ReturnType<typeof testOpenAiCompatibleAgentCapability>>,
    ) => void
    mockTestOpenAiCompatibleAgentCapability.mockImplementation(() => new Promise((resolve) => {
      resolveAgentCheck = resolve
    }))
    renderSettings(true)

    fireEvent.click(screen.getByRole('button', { name: /自訂 AI 端點/ }))
    fireEvent.click(screen.getByRole('button', { name: '檢查 Agent 支援' }))

    act(() => useAiConfigStore.getState().clearOpenAiCompatibleConfig())
    await act(async () => {
      resolveAgentCheck({ status: 'verified' })
    })

    expect(useAiConfigStore.getState().openAiCompatibleProfiles).toHaveLength(0)
    expect(screen.queryByText('支援 Agent 深入模式，已自動儲存。'))
      .not.toBeInTheDocument()
  })

  it('separates cloud model credentials from the Perplexity Agent tool', () => {
    renderSettings(false)

    fireEvent.click(screen.getByRole('button', { name: /^雲端 AI 0 \/ 3/ }))
    expect(screen.getByTestId('auth-status')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'OpenAI 未設定' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gemini 未設定' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Claude 未設定' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/個人 Perplexity API 金鑰/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /深入對話工具/ }))
    expect(screen.getByLabelText(/個人 Perplexity API 金鑰/)).toBeInTheDocument()
    expect(screen.queryByTestId('auth-status')).not.toBeInTheDocument()
  })

  it('labels and updates persistence for cloud and tool keys', async () => {
    renderSettings(true)

    fireEvent.click(screen.getByRole('button', { name: /隱私與裝置保存/ }))
    const persistenceSwitch = screen.getByRole('switch', {
      name: '在此裝置記住雲端 AI 與工具金鑰',
    })
    expect(persistenceSwitch).not.toBeChecked()
    fireEvent.click(persistenceSwitch)
    await waitFor(() => {
      expect(useAiConfigStore.getState().storageType).toBe('localStorage')
    })
  })
})
