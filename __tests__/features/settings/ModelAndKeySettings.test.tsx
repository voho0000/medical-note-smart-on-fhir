import { fireEvent, render, screen } from '@testing-library/react'
import { ModelAndKeySettings } from '@/features/settings/components/ApiKeyField'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { useAiConfigStore } from '@/src/application/stores/ai-config.store'

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
    },
  })
}

describe('ModelAndKeySettings progressive disclosure', () => {
  beforeEach(() => {
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
