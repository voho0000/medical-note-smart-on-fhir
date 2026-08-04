import { act, renderHook, waitFor } from '@testing-library/react'
import { useSmartTitleGeneration } from '@/src/application/hooks/chat/use-smart-title-generation.hook'

const mockExecute = jest.fn()
const mockUpdateTitle = jest.fn(async (
  _sessionId: string,
  _userId: string,
  _title: string,
) => undefined)
const mockUpdateSession = jest.fn()
const mockSetIsTitleGenerating = jest.fn()
const mockCaptureAiRuntimeConfig = jest.fn(() => ({ model: 'cloud-model' }))

let mockMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []
let mockCurrentSessionId: string | null = 'session-1'

jest.mock('@/src/application/providers/auth.provider', () => ({
  useAuth: () => ({ user: { uid: 'doctor-1' } }),
}))

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({ locale: 'zh-TW' }),
}))

jest.mock('@/src/application/hooks/chat/use-fhir-context.hook', () => ({
  useFhirContext: () => ({
    patientId: 'patient-1',
    fhirServerUrl: 'https://fhir.example',
  }),
}))

jest.mock('@/src/application/hooks/patient/use-patient-query.hook', () => ({
  usePatient: () => ({
    patient: {
      id: 'patient-1',
      name: [{ text: '王小明' }],
      identifier: [{ value: 'A123456789' }],
    },
  }),
}))

jest.mock('@/src/application/stores/chat.store', () => ({
  useChatStore: (selector: (state: { messages: typeof mockMessages }) => unknown) => (
    selector({ messages: mockMessages })
  ),
}))

jest.mock('@/src/application/stores/chat-history.store', () => {
  const useChatHistoryStore = (
    selector: (state: {
      currentSessionId: string | null
      setIsTitleGenerating: typeof mockSetIsTitleGenerating
    }) => unknown,
  ) => selector({
    currentSessionId: mockCurrentSessionId,
    setIsTitleGenerating: mockSetIsTitleGenerating,
  })
  useChatHistoryStore.getState = () => ({
    currentSessionId: mockCurrentSessionId,
    setIsTitleGenerating: mockSetIsTitleGenerating,
  })
  return { useChatHistoryStore }
})

jest.mock('@/src/application/hooks/chat/use-chat-sessions-query.hook', () => ({
  useUpdateSessionMutation: () => ({ updateSession: mockUpdateSession }),
}))

jest.mock('@/src/application/composition.chat', () => ({
  getChatSessionRepository: () => ({
    updateTitle: (sessionId: string, userId: string, title: string) => (
      mockUpdateTitle(sessionId, userId, title)
    ),
  }),
}))

jest.mock('@/src/application/composition.ai', () => ({
  captureAiRuntimeConfig: () => mockCaptureAiRuntimeConfig(),
  createSmartTitleUseCase: () => ({ execute: mockExecute }),
}))

const firstExchange = [
  { role: 'user' as const, content: 'private custom-endpoint question' },
  { role: 'assistant' as const, content: 'private custom-endpoint answer' },
]

describe('useSmartTitleGeneration privacy gate', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockMessages = []
    mockCurrentSessionId = 'session-1'
  })

  it('does not enter the cloud title pipeline while disabled', () => {
    const { rerender } = renderHook(
      ({ enabled }) => useSmartTitleGeneration({ enabled }),
      { initialProps: { enabled: false } },
    )

    mockMessages = firstExchange
    rerender({ enabled: false })

    expect(mockCaptureAiRuntimeConfig).not.toHaveBeenCalled()
    expect(mockExecute).not.toHaveBeenCalled()
    expect(mockUpdateTitle).not.toHaveBeenCalled()
    expect(mockUpdateSession).not.toHaveBeenCalled()
    expect(mockSetIsTitleGenerating).not.toHaveBeenCalled()
  })

  it('invalidates an in-flight title before a custom-endpoint switch can write Firestore', async () => {
    let resolveTitle!: (title: string) => void
    mockExecute.mockImplementationOnce(() => new Promise<string>((resolve) => {
      resolveTitle = resolve
    }))
    const { rerender } = renderHook(
      ({ enabled }) => useSmartTitleGeneration({ enabled }),
      { initialProps: { enabled: true } },
    )

    mockMessages = firstExchange
    rerender({ enabled: true })
    await waitFor(() => expect(mockExecute).toHaveBeenCalledTimes(1))

    // Model selection closes the gate before the old async title resolves.
    rerender({ enabled: false })
    await act(async () => {
      resolveTitle('Generated cloud title')
      await Promise.resolve()
    })

    expect(mockUpdateTitle).not.toHaveBeenCalled()
    expect(mockUpdateSession).not.toHaveBeenCalled()
    expect(mockSetIsTitleGenerating).toHaveBeenCalledWith(false)
  })

  it('sends a scrubbed transcript copy to the title model', async () => {
    mockExecute.mockResolvedValueOnce('Generated title')
    const { rerender } = renderHook(
      ({ enabled }) => useSmartTitleGeneration({ enabled }),
      { initialProps: { enabled: true } },
    )

    mockMessages = [
      { role: 'user', content: '請整理王小明 A123456789 的病歷' },
      { role: 'assistant', content: '王小明目前狀況穩定' },
    ]
    rerender({ enabled: true })

    await waitFor(() => expect(mockExecute).toHaveBeenCalledTimes(1))
    const outbound = mockExecute.mock.calls[0][0]
    expect(outbound.userMessage).not.toContain('王小明')
    expect(outbound.userMessage).not.toContain('A123456789')
    expect(outbound.assistantMessage).not.toContain('王小明')
  })
})
