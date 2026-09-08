import { toast } from 'sonner'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { en } from '@/src/shared/i18n/locales/en'
import { TemplateRestore } from '@/src/shared/components/TemplateRestore'
import { saveChatTemplate } from '@/src/infrastructure/firebase/template-sync'
import { saveClinicalInsightPanel } from '@/src/infrastructure/firebase/clinical-insights-sync'

jest.mock('sonner', () => ({ toast: { success: jest.fn(), info: jest.fn(), error: jest.fn() } }))

jest.mock('@/src/application/providers/language.provider', () => ({ useLanguage: () => ({ t: en }) }))
// Exercise the real collection-specific encoder, without any network writes.
jest.mock('@/src/infrastructure/firebase/user-collection-sync', () => ({
  createUserCollectionSync: (config: { toDoc: (item: unknown, now: Timestamp) => unknown }) => ({
    save: async (_owner: string, item: unknown) => config.toDoc(item, Timestamp.now()) !== null,
  }),
}))

type TestTemplate = { id: string; [key: string]: unknown }

const createdAt = new Date('2026-08-10T03:00:00.000Z')
const updatedAt = new Date('2026-09-08T01:00:00.000Z')
const cases = [
  { kind: 'chat', save: (item: unknown) => saveChatTemplate('account-1', item as Parameters<typeof saveChatTemplate>[1]), original: {
    id: 'custom-chat', label: 'Custom', content: 'Keep my chat prompt', shortcut: 'custom', order: 0,
    audience: 'medical' as const, createdAt, updatedAt,
  }, defaults: { id: 'system', label: 'System', content: 'System prompt', order: 0, audience: 'medical' as const }, nameKey: 'label', promptKey: 'content' },
  { kind: 'summary', save: (item: unknown) => saveClinicalInsightPanel('account-1', item as Parameters<typeof saveClinicalInsightPanel>[1]), original: {
    id: 'custom-summary', title: 'Custom', prompt: 'Keep my summary prompt', order: 0,
    audience: 'medical' as const, showInSummary: true, autoGenerate: false,
    outputFormat: 'markdown' as const, languagePolicy: 'interface-language' as const, createdAt, updatedAt,
  }, defaults: { id: 'system', title: 'System', prompt: 'System prompt', order: 0, audience: 'medical' as const,
    showInSummary: true, autoGenerate: false, outputFormat: 'markdown' as const, languagePolicy: 'interface-language' as const }, nameKey: 'title', promptKey: 'prompt' },
]

beforeEach(() => localStorage.clear())

test.each(cases)('$kind account backup recovers through its real Firestore encoder after a reload', async ({ kind, original, defaults, save, nameKey, promptKey }) => {
  const storageKey = `backup:${kind}:account-1:medical`
  // The component handles a homogeneous template array; each case uses its own encoder.
  const onApply = jest.fn(async (items: TestTemplate[]) => {
    for (const item of items) await save(item)
    return true
  })
  const props = { storageKey, scopeLabel: kind, getDefaults: () => [defaults], nameKey: nameKey as keyof typeof original,
    promptKey: promptKey as keyof typeof original, onApply }
  const first = render(<TemplateRestore<TestTemplate> {...props} items={[original]} />)
  fireEvent.click(screen.getByRole('button', { name: en.settings.templateRestoreTitle }))
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: en.settings.templateRestoreTitle }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  const storedBackup = localStorage.getItem(storageKey)
  expect(storedBackup).toContain(createdAt.toISOString())
  first.unmount()
  render(<TemplateRestore<TestTemplate> {...props} items={[defaults]} />)
  fireEvent.click(await screen.findByRole('button', { name: en.settings.templateRestoreRecover }))
  await waitFor(() => expect(toast.success).toHaveBeenLastCalledWith(en.settings.templateRestoreRecovered, { id: storageKey }))
  expect(screen.queryByText(en.settings.templateRestoreSaved)).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(onApply).toHaveBeenLastCalledWith([original])
  expect(localStorage.getItem(storageKey)).toBeNull()
  expect(screen.queryByRole('button', { name: en.settings.templateRestoreRecover })).not.toBeInTheDocument()
})
