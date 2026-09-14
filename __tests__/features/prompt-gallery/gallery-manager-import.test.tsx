import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { ChatTemplate } from '@/src/application/providers/chat-templates.provider'
import type { InsightPanelConfig } from '@/src/application/providers/clinical-insights-config.provider'
import type { SharedPrompt } from '@/features/prompt-gallery/types/prompt.types'

let mockChats: ChatTemplate[] = []
let mockPanels: InsightPanelConfig[] = []
const mockPrompt = { id: 'same-source', tenantId: 'hospital', title: 'Gallery import regression', prompt: 'Original prompt', types: ['chat', 'summary'] } as SharedPrompt
jest.mock('@/src/application/providers/auth.provider', () => ({ useAuth: () => ({ user: { uid: 'test-account' }, loading: false }) }))
jest.mock('@/src/application/providers/language.provider', () => ({ useLanguage: () => ({ locale: 'zh-TW', t: jest.requireActual('@/src/shared/i18n/locales/zh-TW').zhTW }) }))
jest.mock('@/src/application/providers/audience.provider', () => ({ useAudience: () => ({ audience: 'medical' }) }))
jest.mock('@/src/infrastructure/firebase/template-sync', () => ({
  subscribeToChatTemplates: (_uid: string, listener: (templates: ChatTemplate[]) => void) => { listener(mockChats); return jest.fn() },
  replaceAllChatTemplates: async (_uid: string, templates: ChatTemplate[]) => { mockChats = templates; return true },
  batchSaveChatTemplates: jest.fn(),
}))
jest.mock('@/src/infrastructure/firebase/clinical-insights-sync', () => ({
  subscribeToClinicalInsightPanels: (_uid: string, listener: (panels: InsightPanelConfig[]) => void) => { listener(mockPanels); return jest.fn() },
  applyClinicalInsightPanelChanges: async (_uid: string, upserts: InsightPanelConfig[], deletes: string[]) => {
    mockPanels = mockPanels.filter(p => !deletes.includes(p.id) && !upserts.some(u => u.id === p.id)).concat(upserts)
    return true
  },
}))
// Replace only the remote gallery boundary. Managers, editors, providers and saves are real.
jest.mock('@/features/prompt-gallery', () => ({
  PromptGalleryDialog: ({ open, onSelectPrompt, mode }: { open: boolean; mode: 'chat' | 'summary'; onSelectPrompt: (p: SharedPrompt, mode: 'chat' | 'summary') => void }) => open ? (
    <button onClick={() => { onSelectPrompt(mockPrompt, mode); onSelectPrompt(mockPrompt, mode) }}>Use gallery twice</button>
  ) : null,
  SharePromptDialog: () => null,
}))
jest.mock('@/features/prompt-gallery/components/LoginRequiredDialog', () => ({ LoginRequiredDialog: () => null }))
jest.mock('@/src/shared/components/TemplateRestore', () => ({ TemplateRestore: () => null }))
jest.mock('@/src/shared/components/InfoHint', () => ({ InfoHint: () => null }))
jest.mock('@/src/shared/components/ModelPicker', () => ({ ModelPicker: () => null }))
jest.mock('@/src/application/stores/model-prefs.store', () => ({ MODEL_PREF_DEFAULTS: { insights: 'model' }, useModelPref: () => 'model', useSetModelFor: () => jest.fn() }))
import { ChatTemplatesProvider } from '@/src/application/providers/chat-templates.provider'
import { ClinicalInsightsConfigProvider, getDefaultClinicalInsightPanels } from '@/src/application/providers/clinical-insights-config.provider'
import { ChatTemplatesSettings } from '@/features/settings/components/ChatTemplatesSettings'
import { CustomInsightModulesManager } from '@/features/clinical-insights/components/CustomInsightModulesManager'

function wrapper({ children }: { children: ReactNode }) {
  return <ChatTemplatesProvider><ClinicalInsightsConfigProvider>{children}</ClinicalInsightsConfigProvider></ChatTemplatesProvider>
}
beforeEach(() => {
  localStorage.clear()
  mockChats = [{ id: 'existing', label: 'Existing chat', content: 'Existing', audience: 'medical', order: 0 }]
  mockPanels = [...getDefaultClinicalInsightPanels('zh-TW', 'medical'), ...getDefaultClinicalInsightPanels('zh-TW', 'patient')]
  Element.prototype.scrollIntoView = jest.fn()
})

it.each(['chat', 'summary'] as const)('%s manager reuses repeated selections, saves edits and reuses them after account reload', async mode => {
  const Component = mode === 'chat' ? ChatTemplatesSettings : CustomInsightModulesManager
  let view = render(<Component />, { wrapper })
  const openGallery = async () => {
    const buttons = await screen.findAllByRole('button', { name: '瀏覽範本庫' })
    fireEvent.click(buttons[0])
  }
  const imported = () => mode === 'chat' ? mockChats.filter(t => t.sourcePromptKey) : mockPanels.filter(p => p.sourcePromptKey)
  await openGallery()
  fireEvent.click(screen.getByRole('button', { name: 'Use gallery twice' }))
    if (screen.queryByRole('button', { name: '知道了' })) fireEvent.click(screen.getByRole('button', { name: '知道了' }))
  await waitFor(() => expect(imported()).toHaveLength(1))
  const id = imported()[0].id
  const input = () => view.container.querySelector('textarea')!
  await waitFor(() => expect(input()).toHaveValue('Original prompt'))
  fireEvent.change(input(), { target: { value: 'My local edits' } })
  await openGallery()
  fireEvent.click(screen.getByRole('button', { name: 'Use gallery twice' }))
    if (screen.queryByRole('button', { name: '知道了' })) fireEvent.click(screen.getByRole('button', { name: '知道了' }))
  await waitFor(() => expect(imported()[0]).toMatchObject(mode === 'chat' ? { content: 'My local edits' } : { prompt: 'My local edits' }))
  expect(imported()).toHaveLength(1)
  expect(input()).toHaveValue('My local edits')
  view.unmount()
  view = render(<Component />, { wrapper })
  await openGallery()
  fireEvent.click(screen.getByRole('button', { name: 'Use gallery twice' }))
    if (screen.queryByRole('button', { name: '知道了' })) fireEvent.click(screen.getByRole('button', { name: '知道了' }))
  await waitFor(() => expect(input()).toHaveValue('My local edits'))
  expect(imported()).toHaveLength(1)
  expect(imported()[0].id).toBe(id)
})
