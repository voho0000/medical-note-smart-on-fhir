import { act, renderHook } from '@testing-library/react'
import { useChatHistoryDrawer } from '@/features/chat-history/hooks/useChatHistoryDrawer'

const mockForceSave = jest.fn(async () => undefined)
const mockLoadSession = jest.fn(async () => undefined)
const mockStartNewSession = jest.fn()
const mockDeleteSession = jest.fn(async (_sessionId: string) => undefined)
const mockAutoSaveOptions: Array<Record<string, unknown>> = []
const mockToastError = jest.fn()

jest.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
  },
}))

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    t: {
      chatHistory: {
        deleteFailed: 'Delete failed',
        saveBeforeNewChatFailed: 'Save failed — conversation kept',
        loadFailed: 'Load failed',
      },
    },
  }),
}))

jest.mock('@/src/application/hooks/chat/use-chat-history.hook', () => ({
  useChatHistory: () => ({
    sessions: [],
    isLoading: false,
    deleteSession: mockDeleteSession,
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

describe('useChatHistoryDrawer failure feedback', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAutoSaveOptions.length = 0
  })

  it('keeps the conversation when the pre-新對話 save fails', async () => {
    mockForceSave.mockRejectedValueOnce(new Error('offline'))
    const { result } = renderHook(() => useChatHistoryDrawer('patient-1', 'https://fhir.example'))

    await act(async () => {
      await result.current.handleNewChat()
    })

    // The whole point of the force-save is not losing this conversation —
    // a failed save must not be the thing that discards it.
    expect(mockStartNewSession).not.toHaveBeenCalled()
    expect(mockToastError).toHaveBeenCalledWith('Save failed — conversation kept')
    expect(result.current.open).toBe(false)
  })

  it('reports a failed session load instead of a dead tap', async () => {
    mockLoadSession.mockRejectedValueOnce(new Error('not found'))
    const { result } = renderHook(() => useChatHistoryDrawer('patient-1', 'https://fhir.example'))

    await act(async () => {
      await result.current.handleLoadSession('cloud-session-1')
    })

    expect(mockToastError).toHaveBeenCalledWith('Load failed')
  })

  it('holds the delete dialog open until the delete settles, and on failure', async () => {
    let resolveDelete: (() => void) | undefined
    mockDeleteSession.mockImplementationOnce(() => new Promise<undefined>((resolve) => {
      resolveDelete = () => resolve(undefined)
    }))
    const { result } = renderHook(() => useChatHistoryDrawer('patient-1', 'https://fhir.example'))

    act(() => {
      result.current.handleDeleteSession('session-1', {
        stopPropagation: jest.fn(),
      } as unknown as React.MouseEvent)
    })
    expect(result.current.pendingDeleteId).toBe('session-1')

    let confirmed: Promise<void> | undefined
    act(() => {
      confirmed = result.current.confirmDeleteSession()
    })
    // Still in flight: the dialog must stay up with a pending action.
    expect(result.current.isDeleting).toBe(true)
    expect(result.current.pendingDeleteId).toBe('session-1')

    await act(async () => {
      resolveDelete?.()
      await confirmed
    })
    expect(result.current.isDeleting).toBe(false)
    expect(result.current.pendingDeleteId).toBeNull()

    // A failed delete keeps the dialog open so retry is one tap away.
    mockDeleteSession.mockRejectedValueOnce(new Error('offline'))
    act(() => {
      result.current.handleDeleteSession('session-2', {
        stopPropagation: jest.fn(),
      } as unknown as React.MouseEvent)
    })
    await act(async () => {
      await result.current.confirmDeleteSession()
    })
    expect(mockToastError).toHaveBeenCalledWith('Delete failed')
    expect(result.current.pendingDeleteId).toBe('session-2')
    expect(result.current.isDeleting).toBe(false)
  })
})
