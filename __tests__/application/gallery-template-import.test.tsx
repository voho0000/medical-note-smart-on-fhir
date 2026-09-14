import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

let mockAudience: 'medical' | 'patient' = 'medical'
jest.mock('@/src/application/providers/auth.provider', () => ({ useAuth: () => ({ user: null, loading: false }) }))
jest.mock('@/src/application/providers/language.provider', () => ({ useLanguage: () => ({ locale: 'en' }) }))
jest.mock('@/src/application/providers/audience.provider', () => ({ useAudience: () => ({ audience: mockAudience }) }))
jest.mock('@/src/infrastructure/firebase/template-sync', () => ({
  subscribeToChatTemplates: jest.fn(), replaceAllChatTemplates: jest.fn(), batchSaveChatTemplates: jest.fn(),
}))
jest.mock('@/src/infrastructure/firebase/clinical-insights-sync', () => ({
  subscribeToClinicalInsightPanels: jest.fn(), applyClinicalInsightPanelChanges: jest.fn(),
}))
import { ChatTemplatesProvider, useChatTemplates } from '@/src/application/providers/chat-templates.provider'
import { ClinicalInsightsConfigProvider, useClinicalInsightsConfig } from '@/src/application/providers/clinical-insights-config.provider'
import { gallerySourceKey } from '@/src/shared/utils/gallery-template.utils'

function wrapper({ children }: { children: ReactNode }) {
  return <ChatTemplatesProvider><ClinicalInsightsConfigProvider>{children}</ClinicalInsightsConfigProvider></ChatTemplatesProvider>
}
function useLibraries() { return { chat: useChatTemplates(), summary: useClinicalInsightsConfig() } }
const chatImport = { label: 'Gallery template', content: 'Full prompt', sourcePromptKey: gallerySourceKey({ id: 'source' }) }
const summaryImport = { title: chatImport.label, prompt: chatImport.content, sourcePromptKey: chatImport.sourcePromptKey,
  outputFormat: 'markdown' as const, languagePolicy: 'interface-language' as const, showInSummary: true, autoGenerate: false }
beforeEach(() => { localStorage.clear(); mockAudience = 'medical' })

it('reuses both imports even for two clicks before React renders, and preserves edits', async () => {
  const { result } = renderHook(useLibraries, { wrapper })
  await waitFor(() => expect(result.current.chat.isLoading || result.current.summary.isLoading).toBe(false))
  const chatCount = result.current.chat.templates.length
  const summaryCount = result.current.summary.panels.length
  let chatId: string | null = null
  let summaryId: string | null = null
  act(() => {
    chatId = result.current.chat.addTemplate(chatImport)
    expect(result.current.chat.addTemplate(chatImport)).toBe(chatId)
    summaryId = result.current.summary.addPanel(summaryImport)
    expect(result.current.summary.addPanel(summaryImport)).toBe(summaryId)
  })
  expect(result.current.chat.templates).toHaveLength(chatCount + 1)
  expect(result.current.summary.panels).toHaveLength(summaryCount + 1)
  act(() => {
    result.current.chat.updateTemplate(chatId!, { label: 'My edited title', content: 'My edits', shortcut: 'mine' })
    result.current.summary.updatePanel(summaryId!, { title: 'My edited title', prompt: 'My edits', showInSummary: false })
  })
  act(() => {
    expect(result.current.chat.addTemplate({ ...chatImport, content: 'Updated upstream' })).toBe(chatId)
    expect(result.current.summary.addPanel({ ...summaryImport, prompt: 'Updated upstream' })).toBe(summaryId)
  })
  expect(result.current.chat.templates.find(t => t.id === chatId)).toMatchObject({ content: 'My edits', shortcut: 'mine' })
  expect(result.current.summary.panels.find(p => p.id === summaryId)).toMatchObject({ prompt: 'My edits', showInSummary: false })
})

it('adopts exact legacy copies without deleting duplicates or merging different content', async () => {
  const { result } = renderHook(useLibraries, { wrapper })
  let chatId: string | null = null
  let summaryId: string | null = null
  act(() => {
    chatId = result.current.chat.addTemplate({ ...chatImport, sourcePromptKey: undefined })
    result.current.chat.addTemplate({ ...chatImport, sourcePromptKey: undefined })
    result.current.chat.addTemplate({ ...chatImport, sourcePromptKey: undefined, content: 'Different' })
    summaryId = result.current.summary.addPanel({ ...summaryImport, sourcePromptKey: undefined })
    result.current.summary.addPanel({ ...summaryImport, sourcePromptKey: undefined })
    result.current.summary.addPanel({ ...summaryImport, sourcePromptKey: undefined, prompt: 'Different' })
  })
  const chatCount = result.current.chat.templates.length
  const summaryCount = result.current.summary.panels.length
  act(() => {
    expect(result.current.chat.addTemplate(chatImport)).toBe(chatId)
    expect(result.current.summary.addPanel(summaryImport)).toBe(summaryId)
  })
  expect(result.current.chat.templates).toHaveLength(chatCount)
  expect(result.current.summary.panels).toHaveLength(summaryCount)
  expect(result.current.chat.templates.find(t => t.id === chatId)?.sourcePromptKey).toBe(chatImport.sourcePromptKey)
  expect(result.current.summary.panels.find(p => p.id === summaryId)?.sourcePromptKey).toBe(summaryImport.sourcePromptKey)
})

it('keeps source identity across a guest chat reload and summary apply/restore', async () => {
  const first = renderHook(useLibraries, { wrapper })
  act(() => {
    first.result.current.chat.addTemplate(chatImport)
    first.result.current.summary.addPanel(summaryImport)
  })
  const panels = first.result.current.summary.panels
  await act(async () => { await first.result.current.summary.applyPanels(panels) })
  act(() => { first.result.current.summary.addPanel(summaryImport) })
  expect(first.result.current.summary.panels).toHaveLength(panels.length)
  const templates = first.result.current.chat.templates
  first.unmount()
  const next = renderHook(useLibraries, { wrapper })
  act(() => { next.result.current.chat.addTemplate(chatImport) })
  expect(next.result.current.chat.templates).toEqual(templates)
})

it('scopes imports by audience and tenant, while manual additions stay independent', () => {
  const { result, rerender } = renderHook(useLibraries, { wrapper })
  act(() => { result.current.chat.addTemplate(chatImport); result.current.summary.addPanel(summaryImport) })
  const medicalId = result.current.chat.templates.at(-1)!.id
  mockAudience = 'patient'
  rerender()
  act(() => { result.current.chat.addTemplate(chatImport); result.current.summary.addPanel(summaryImport) })
  expect(result.current.chat.templates.at(-1)!.id).not.toBe(medicalId)
  const chatCount = result.current.chat.templates.length
  const summaryCount = result.current.summary.panels.length
  act(() => {
    const sourcePromptKey = gallerySourceKey({ id: 'source', tenantId: 'hospital' })
    result.current.chat.addTemplate({ ...chatImport, sourcePromptKey })
    result.current.summary.addPanel({ ...summaryImport, sourcePromptKey })
    result.current.chat.addTemplate(); result.current.chat.addTemplate()
    result.current.summary.addPanel(); result.current.summary.addPanel()
  })
  expect(result.current.chat.templates).toHaveLength(chatCount + 3)
  expect(result.current.summary.panels).toHaveLength(summaryCount + 3)
})

it('reuses existing imports at capacity but rejects new sources', async () => {
  const { result } = renderHook(useLibraries, { wrapper })
  const template = { ...result.current.chat.templates[0], ...chatImport, id: 'saved-chat' }
  const panel = { ...result.current.summary.panels[0], ...summaryImport, id: 'saved-summary' }
  await act(async () => {
    await result.current.chat.applyTemplates(Array.from({ length: result.current.chat.maxTemplates }, (_, order) => (
      order === 0 ? template : { ...template, id: `chat-${order}`, sourcePromptKey: `other-${order}`, order }
    )))
    await result.current.summary.applyPanels(Array.from({ length: result.current.summary.maxPanels }, (_, order) => (
      order === 0 ? panel : { ...panel, id: `summary-${order}`, sourcePromptKey: `other-${order}`, order }
    )))
  })
  act(() => {
    expect(result.current.chat.addTemplate(chatImport)).toBe('saved-chat')
    expect(result.current.summary.addPanel(summaryImport)).toBe('saved-summary')
    expect(result.current.chat.addTemplate({ ...chatImport, sourcePromptKey: 'new-source' })).toBeNull()
    expect(result.current.summary.addPanel({ ...summaryImport, sourcePromptKey: 'new-source' })).toBeNull()
  })
  expect(result.current.chat.templates).toHaveLength(result.current.chat.maxTemplates)
  expect(result.current.summary.panels).toHaveLength(result.current.summary.maxPanels)
})

it('allows importing a source again after its saved copy is explicitly deleted', () => {
  const { result } = renderHook(useLibraries, { wrapper })
  let chatId: string | null = null
  let panelId: string | null = null
  act(() => {
    chatId = result.current.chat.addTemplate(chatImport)
    panelId = result.current.summary.addPanel(summaryImport)
  })
  act(() => {
    result.current.chat.removeTemplate(chatId!)
    result.current.summary.removePanel(panelId!)
  })
  act(() => {
    expect(result.current.chat.addTemplate(chatImport)).not.toBe(chatId)
    expect(result.current.summary.addPanel(summaryImport)).not.toBe(panelId)
  })
  expect(result.current.chat.templates.filter(t => t.sourcePromptKey === chatImport.sourcePromptKey)).toHaveLength(1)
  expect(result.current.summary.panels.filter(p => p.sourcePromptKey === summaryImport.sourcePromptKey)).toHaveLength(1)
})
