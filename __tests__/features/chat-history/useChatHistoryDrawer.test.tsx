import { act, renderHook } from '@testing-library/react'
import { useChatHistoryDrawer } from '@/features/chat-history/hooks/useChatHistoryDrawer'

const mockForceSave = jest.fn(async () => undefined)
const mockLoadSession = jest.fn(async () => undefined)
const mockStartNewSession = jest.fn()
const mockAutoSaveOptions: Array<Record<string, unknown>> = []

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({ t: { chatHistory: { deleteFailed: 'Delete failed' } } }),
}))

jest.mock('@/src/application/hooks/chat/use-chat-history.hook', () => ({
  useChatHistory: () => ({
    sessions: [],
    isLoading: false,
    deleteSession: jest.fn(),
  }),
}))

jest.mock('@/src/application/hooks/chat/use-chat-session.hook', () => ({
  useChatSession: () => ({
    loadSession: mockLoadSession,
    startNewSession: mockStartNewSession,
  }),
}))

jest.mock('@/src/application/hooks/chat/use-auto-save-chat.hook', () => ({
  useAutoSaveChat: (options: Record<string, unknown>) => {
    mockAutoSaveOptions.push(options)
    return { forceSave: mockForceSave, isSaving: false }
  },
}))

jest.mock('@/src/application/stores/chat-history.store', () => ({
  useChatHistoryStore: (selector: (state: { currentSessionId: null }) => unknown) => (
    selector({ currentSessionId: null })
  ),
}))

jest.mock('@/src/application/stores/chat.store', () => ({
  useChatStore: (selector: (state: { messages: never[] }) => unknown) => (
    selector({ messages: [] })
  ),
}))

describe('useChatHistoryDrawer persistence boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAutoSaveOptions.length = 0
  })

  it('keeps every drawer force-save path closed for a custom endpoint', async () => {
    const { result } = renderHook(() => useChatHistoryDrawer(
      'patient-1',
      'https://fhir.example',
      { persistenceEnabled: false },
    ))

    expect(mockAutoSaveOptions.at(-1)).toMatchObject({ enabled: false })

    await act(async () => {
      await result.current.handleNewChat()
      await result.current.handleLoadSession('cloud-session-1')
    })

    expect(mockForceSave).not.toHaveBeenCalled()
    expect(mockStartNewSession).toHaveBeenCalledTimes(1)
    expect(mockLoadSession).toHaveBeenCalledWith('cloud-session-1')
  })

  it('preserves force-save-before-switch for an enabled cloud conversation', async () => {
    const { result } = renderHook(() => useChatHistoryDrawer(
      'patient-1',
      'https://fhir.example',
      { persistenceEnabled: true },
    ))

    await act(async () => {
      await result.current.handleNewChat()
      await result.current.handleLoadSession('cloud-session-1')
    })

    expect(mockForceSave).toHaveBeenCalledTimes(2)
  })
})
