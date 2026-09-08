import { toast } from 'sonner'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { TemplateRestore } from '@/src/shared/components/TemplateRestore'
import { en } from '@/src/shared/i18n/locales/en'

jest.mock('sonner', () => ({ toast: { success: jest.fn(), info: jest.fn(), error: jest.fn() } }))

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({ t: en }),
}))

const s = en.settings
const original = [{ id: 'custom', label: 'My template', content: 'My irreplaceable prompt', shortcut: 'mine', order: 0, audience: 'medical' }]
const defaults = [{ id: 'system', label: 'System', content: 'Original system prompt', shortcut: 'system', order: 0, audience: 'medical' }]
const storageKey = 'template-backup:chat:guest:medical'
const apply = jest.fn()
function view(items = original, key = storageKey) {
  return <TemplateRestore storageKey={key} scopeLabel="Medical chat" items={items} getDefaults={() => defaults} nameKey="label" promptKey="content" onApply={apply} />
}
function confirmRestore() {
  fireEvent.click(screen.getByRole('button', { name: s.templateRestoreTitle }))
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: s.templateRestoreTitle }))
}
beforeEach(() => { localStorage.clear(); apply.mockReset().mockResolvedValue(true) })
afterEach(() => jest.restoreAllMocks())

test('canceling confirmation does not apply or back up anything', () => {
  render(view())
  expect(screen.queryByRole('button', { name: s.templateRestoreRecover })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: s.templateRestoreTitle }))
  fireEvent.click(screen.getByRole('button', { name: s.templateRestoreKeep }))
  expect(localStorage.getItem(storageKey)).toBeNull()
  expect(apply).not.toHaveBeenCalled()
})

test('confirmation applies directly and backup survives remount and repeated restores', async () => {
  const first = render(view())
  confirmRestore()
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  expect(apply).toHaveBeenCalledWith(defaults)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem(storageKey)!).items).toEqual(original)
  first.unmount()
  render(view(defaults))
  await screen.findByRole('button', { name: s.templateRestoreRecover })
  confirmRestore()
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: s.templateRestoreRecover }))
  await waitFor(() => expect(apply).toHaveBeenLastCalledWith(original))
  await waitFor(() => expect(screen.queryByRole('button', { name: s.templateRestoreRecover })).not.toBeInTheDocument())
  expect(localStorage.getItem(storageKey)).toBeNull()
})

test('hides every responsive copy of the recovery action after recovery succeeds', async () => {
  localStorage.setItem(storageKey, JSON.stringify({ version: 1, items: original }))
  render(
    <>
      {view(defaults)}
      {view(defaults)}
    </>,
  )
  await waitFor(() => expect(screen.getAllByRole('button', { name: s.templateRestoreRecover })).toHaveLength(2))
  fireEvent.click(screen.getAllByRole('button', { name: s.templateRestoreRecover })[0])
  await waitFor(() => expect(screen.queryByRole('button', { name: s.templateRestoreRecover })).not.toBeInTheDocument())
  expect(localStorage.getItem(storageKey)).toBeNull()
})

test('blocks restore when a durable backup cannot be written', async () => {
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded') })
  render(view())
  confirmRestore()
  expect(await screen.findByRole('alert')).toHaveTextContent(s.templateRestoreBackupError)
  expect(apply).not.toHaveBeenCalled()
})

test('retains backup and offers retry in the confirmation on failed save', async () => {
  apply.mockResolvedValueOnce(false)
  render(view())
  confirmRestore()
  await screen.findByText(s.templateRestoreSaveError)
  expect(JSON.parse(localStorage.getItem(storageKey)!).items).toEqual(original)
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: s.templateRestoreTitle }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  await waitFor(() => expect(toast.success).toHaveBeenLastCalledWith(s.templateRestoreSaved, { id: storageKey }))
})

test('shows recovery only for the matching owner, role, and template kind with a valid backup', async () => {
  localStorage.setItem(storageKey, JSON.stringify({version: 1, items: original}))
  const first = render(view(defaults, 'template-backup:summary:other:patient'))
  expect(screen.queryByRole('button', { name: s.templateRestoreRecover })).not.toBeInTheDocument()
  first.unmount()
  localStorage.setItem(storageKey, 'invalid json')
  render(view())
  await waitFor(() => expect(screen.queryByRole('button', { name: s.templateRestoreRecover })).not.toBeInTheDocument())
  expect(apply).not.toHaveBeenCalled()
})
