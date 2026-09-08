import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

const mockAuth = jest.fn()
const mockReplace = jest.fn()
const mockSubscribe = jest.fn()
jest.mock('@/src/application/providers/auth.provider', () => ({ useAuth: () => mockAuth() }))
jest.mock('@/src/application/providers/language.provider', () => ({ useLanguage: () => ({ locale: 'en' }) }))
jest.mock('@/src/application/providers/audience.provider', () => ({ useAudience: () => ({ audience: 'medical' }) }))
jest.mock('@/src/infrastructure/firebase/template-sync', () => ({
  subscribeToChatTemplates: (...args: unknown[]) => mockSubscribe(...args),
  replaceAllChatTemplates: (...args: unknown[]) => mockReplace(...args),
  batchSaveChatTemplates: jest.fn().mockResolvedValue(true),
}))
import { ChatTemplatesProvider, getDefaultChatTemplates, useChatTemplates, type ChatTemplate } from '@/src/application/providers/chat-templates.provider'
function wrapper({children}: {children: ReactNode}) { return <ChatTemplatesProvider>{children}</ChatTemplatesProvider> }
const custom: ChatTemplate = { id: 'mine', label: 'Mine', content: 'Custom prompt', shortcut: 'mine', order: 0, audience: 'medical' }
let account: ChatTemplate[]
beforeEach(() => {
  localStorage.clear()
  mockAuth.mockReturnValue({ user: { uid: 'account-1' } })
  account = [custom, ...getDefaultChatTemplates('en', 'patient')]
  mockSubscribe.mockImplementation((_uid, callback) => { callback(account); return jest.fn() })
  mockReplace.mockImplementation(async (_uid, next) => { account = next; return true })
})

test('explicit apply saves only the current role and can recover complete custom templates', async () => {
  const { result } = renderHook(useChatTemplates, { wrapper })
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  const otherRole = account.filter(item => item.audience === 'patient')
  await act(async () => { expect(await result.current.applyTemplates(getDefaultChatTemplates('en', 'medical'))).toBe(true) })
  expect(account.filter(item => item.audience === 'patient')).toEqual(otherRole)
  await act(async () => { expect(await result.current.applyTemplates([custom])).toBe(true) })
  expect(result.current.templates).toEqual([custom])
  expect(account.filter(item => item.audience === 'patient')).toEqual(otherRole)
})

test('failed account writes report failure and preserve active content', async () => {
  const { result } = renderHook(useChatTemplates, { wrapper })
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  mockReplace.mockResolvedValueOnce(false)
  await act(async () => { expect(await result.current.applyTemplates(getDefaultChatTemplates('en', 'medical'))).toBe(false) })
  expect(result.current.templates).toEqual([custom])
})

test('guest apply persists complete templates including shortcuts across reloads', async () => {
  mockAuth.mockReturnValue({ user: null })
  const first = renderHook(useChatTemplates, { wrapper })
  await waitFor(() => expect(first.result.current.isLoading).toBe(false))
  await act(async () => { expect(await first.result.current.applyTemplates([custom])).toBe(true) })
  first.unmount()
  const next = renderHook(useChatTemplates, { wrapper })
  await waitFor(() => expect(next.result.current.templates).toEqual([custom]))
})
