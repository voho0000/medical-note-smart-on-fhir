import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ModelAndKeySettings } from '@/features/settings/components/ApiKeyField'
import { testOpenAiCompatibleConnection } from '@/src/application/composition.ai'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { useAiConfigStore } from '@/src/application/stores/ai-config.store'

jest.mock('@/src/application/composition.ai', () => ({
  testOpenAiCompatibleConnection: jest.fn(),
}))

const mockTestOpenAiCompatibleConnection = jest.mocked(testOpenAiCompatibleConnection)

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

function renderSettings(offlineMode: boolean) {
  return render(
    <LanguageProvider>
      <ModelAndKeySettings offlineMode={offlineMode} />
    </LanguageProvider>,
  )
}

function setConfiguredLocalEndpoint() {
  useAiConfigStore.setState({
    apiKey: null,
    geminiKey: null,
    perplexityKey: null,
    claudeKey: null,
    storageType: 'sessionStorage',
    openAiCompatible: {
      enabled: true,
      baseUrl: 'http://127.0.0.1:11434/v1',
      modelId: 'qwen2.5:7b',
      apiKey: null,
      contextWindowTokens: 32768,
      contextWindowSource: 'suggested',
    },
  })
}

describe('ModelAndKeySettings progressive disclosure', () => {
  beforeEach(() => {
    mockTestOpenAiCompatibleConnection.mockReset()
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

  it('shows only essential local fields until Advanced settings is opened', () => {
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
    expect(screen.queryByRole('spinbutton', { name: '內容視窗（tokens）' })).not.toBeInTheDocument()

    const advancedTrigger = screen.getByRole('button', { name: '進階設定' })
    expect(advancedTrigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(advancedTrigger)
    expect(screen.getByRole('spinbutton', { name: '內容視窗（tokens）' })).toHaveValue(32768)
    expect(screen.getByRole('textbox', { name: 'API 金鑰（選填）' })).toBeInTheDocument()
  })

  it('opens an unconfigured local profile and distinguishes a disabled saved profile', () => {
    useAiConfigStore.setState({
      openAiCompatible: {
        enabled: false,
        baseUrl: '',
        modelId: '',
        apiKey: null,
        contextWindowTokens: 15000,
        contextWindowSource: 'suggested',
      },
    })
    const { unmount } = renderSettings(true)
    expect(screen.getByRole('button', { name: /自訂 AI 端點/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    unmount()

    useAiConfigStore.setState({
      openAiCompatible: {
        enabled: false,
        baseUrl: 'https://llm.intra.example/v1',
        modelId: 'qwen3:8b',
        apiKey: null,
        contextWindowTokens: 40960,
        contextWindowSource: 'manual',
      },
    })
    renderSettings(true)
    expect(screen.getAllByText('已停用').length).toBeGreaterThan(0)
    expect(screen.queryByText('尚未設定端點')).not.toBeInTheDocument()
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

  it('keeps a new connection profile unsaveable until its test succeeds', async () => {
    useAiConfigStore.setState({
      openAiCompatible: {
        enabled: false,
        baseUrl: '',
        modelId: '',
        apiKey: null,
        contextWindowTokens: 15000,
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
    expect(saveButton).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
    await waitFor(() => expect(saveButton).toBeEnabled())
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
    expect(useAiConfigStore.getState().openAiCompatible.contextWindowTokens).toBe(65536)
    expect(useAiConfigStore.getState().openAiCompatible.contextWindowSource).toBe('manual')
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

    expect(useAiConfigStore.getState().openAiCompatible).toMatchObject({
      contextWindowTokens: 262144,
      contextWindowSource: 'detected',
    })
  })

  it('does not overwrite a saved manual context window during connection testing', async () => {
    useAiConfigStore.setState({
      openAiCompatible: {
        ...useAiConfigStore.getState().openAiCompatible,
        contextWindowTokens: 32768,
        contextWindowSource: 'manual',
      },
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
    fireEvent.click(screen.getByRole('button', { name: '進階設定' }))
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

  it('separates cloud model credentials from the Perplexity Agent tool', () => {
    renderSettings(false)

    fireEvent.click(screen.getByRole('button', { name: /雲端 AI/ }))
    expect(screen.getByTestId('auth-status')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'OpenAI 未設定' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gemini 未設定' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Claude 未設定' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/個人 Perplexity API 金鑰/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /深入對話工具/ }))
    expect(screen.getByLabelText(/個人 Perplexity API 金鑰/)).toBeInTheDocument()
    expect(screen.queryByTestId('auth-status')).not.toBeInTheDocument()
  })

  it('labels and updates persistence for the full AI connection profile', () => {
    renderSettings(true)

    fireEvent.click(screen.getByRole('button', { name: /隱私與裝置保存/ }))
    const persistenceSwitch = screen.getByRole('switch', {
      name: '在此裝置記住 AI 連線設定與金鑰',
    })
    expect(persistenceSwitch).not.toBeChecked()
    fireEvent.click(persistenceSwitch)
    expect(useAiConfigStore.getState().storageType).toBe('localStorage')
  })
})
