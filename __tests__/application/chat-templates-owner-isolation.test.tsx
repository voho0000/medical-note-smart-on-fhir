import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

const mockUseAuth = jest.fn()
const mockSubscribe = jest.fn()
const mockReplaceAll = jest.fn()

jest.mock('@/src/application/providers/auth.provider', () => ({
  useAuth: () => mockUseAuth(),
}))

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({ locale: 'en' }),
}))

jest.mock('@/src/application/providers/audience.provider', () => ({
  useAudience: () => ({ audience: 'medical' }),
}))

jest.mock('@/src/infrastructure/firebase/template-sync', () => ({
  subscribeToChatTemplates: (...args: unknown[]) => mockSubscribe(...args),
  replaceAllChatTemplates: (...args: unknown[]) => mockReplaceAll(...args),
}))

import {
  ChatTemplatesProvider,
  useChatTemplates,
  type ChatTemplate,
} from '@/src/application/providers/chat-templates.provider'

function wrapper({ children }: { children: ReactNode }) {
  return <ChatTemplatesProvider>{children}</ChatTemplatesProvider>
}

function template(id: string, label: string): ChatTemplate {
  return {
    id,
    label,
    content: `${label} content`,
    order: 0,
    audience: 'medical',
  }
}

describe('ChatTemplatesProvider owner isolation', () => {
  let authState: { user: { uid: string } | null; loading: boolean }
  let listeners: Map<string, (templates: ChatTemplate[]) => void>

  beforeEach(() => {
    localStorage.clear()
    listeners = new Map()
    authState = { user: { uid: 'account-1' }, loading: false }
    mockUseAuth.mockImplementation(() => authState)
    mockReplaceAll.mockResolvedValue(true)
    mockSubscribe.mockImplementation((
      uid: string,
      onUpdate: (templates: ChatTemplate[]) => void,
    ) => {
      listeners.set(uid, onUpdate)
      return jest.fn()
    })
  })

  it('hides the previous account immediately while the next account loads', async () => {
    const { result, rerender } = renderHook(() => useChatTemplates(), { wrapper })
    await waitFor(() => expect(listeners.has('account-1')).toBe(true))

    act(() => listeners.get('account-1')?.([template('one', 'Account one private template')]))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.templates.some((item) => item.id === 'one')).toBe(true)

    authState = { user: { uid: 'account-2' }, loading: false }
    rerender()

    expect(result.current.isLoading).toBe(true)
    expect(result.current.templates).toEqual([])
    await waitFor(() => expect(listeners.has('account-2')).toBe(true))

    act(() => listeners.get('account-2')?.([template('two', 'Account two template')]))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.templates.some((item) => item.id === 'one')).toBe(false)
    expect(result.current.templates.some((item) => item.id === 'two')).toBe(true)
  })

  it('does not overwrite guest storage when an account signs out', async () => {
    const guestTemplate = template('guest', 'Guest browser template')
    localStorage.setItem('medical-chat-templates', JSON.stringify([guestTemplate]))
    const { result, rerender } = renderHook(() => useChatTemplates(), { wrapper })
    await waitFor(() => expect(listeners.has('account-1')).toBe(true))
    act(() => listeners.get('account-1')?.([template('private', 'Private account template')]))

    authState = { user: null, loading: false }
    rerender()

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.templates.some((item) => item.id === 'guest')).toBe(true)
    const stored = JSON.parse(localStorage.getItem('medical-chat-templates') ?? '[]')
    expect(stored.some((item: ChatTemplate) => item.id === 'private')).toBe(false)
  })

  it('never silently uploads or removes existing guest templates on login', async () => {
    const guestTemplate = template('guest', 'Import only with consent')
    localStorage.setItem('medical-chat-templates', JSON.stringify([guestTemplate]))

    renderHook(() => useChatTemplates(), { wrapper })
    await waitFor(() => expect(listeners.has('account-1')).toBe(true))

    expect(mockReplaceAll).not.toHaveBeenCalled()
    expect(localStorage.getItem('medical-chat-templates')).toContain('Import only with consent')
  })
})
