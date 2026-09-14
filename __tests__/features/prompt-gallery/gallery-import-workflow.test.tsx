import { fireEvent, render, screen } from '@testing-library/react'
import { toast, type Action } from 'sonner'
import { useGalleryImport, type GalleryImportValue, type GalleryImportItem } from '@/features/prompt-gallery/hooks/useGalleryImport'
import { galleryFingerprint } from '@/src/shared/utils/gallery-template.utils'
jest.mock('@/src/application/providers/language.provider', () => ({ useLanguage: () => ({ locale: 'zh-TW' }) }))
jest.mock('sonner', () => ({ toast: Object.assign(jest.fn(() => 'notice'), { success: jest.fn(), error: jest.fn(), dismiss: jest.fn() }) }))
const add = jest.fn<string | null, [GalleryImportValue]>(() => 'new-id')
const update = jest.fn()
const save = jest.fn()
const insert = jest.fn()
const onImported = jest.fn()
const source: GalleryImportValue = { title: 'Source', content: 'Original', sourcePromptKey: 'source-1' }
const original: GalleryImportItem = { ...source, id: 'saved-id', sourcePromptFingerprint: galleryFingerprint(source) }
function Harness({ item = original, value = source, scope = 'alice' }: { item?: GalleryImportItem; value?: GalleryImportValue; scope?: string }) {
  const flow = useGalleryImport({ scope, items: [item], add, update, save, insert })
  return <><button onClick={() => flow.importPrompt(value, onImported)}>Import</button>{flow.dialog}</>
}
beforeEach(() => { jest.clearAllMocks(); add.mockReturnValue('new-id') })

it.each(['source-1', 'another-source', undefined])('only notifies for identical content with source %s', sourcePromptKey => {
  render(<Harness item={{ ...original, sourcePromptKey }} />)
  fireEvent.click(screen.getByText('Import'))
  expect(screen.getByRole('dialog', { name: '你已經有這份範本' })).toBeInTheDocument()
  expect(screen.getByText(/這次未重複帶入/)).toBeInTheDocument()
  expect(add).not.toHaveBeenCalled()
  expect(update).not.toHaveBeenCalled()
  expect(save).not.toHaveBeenCalled()
  expect(onImported).not.toHaveBeenCalled()
  expect(insert).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '知道了' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('reuses local edits quietly and offers an explicit independent copy', () => {
  render(<Harness item={{ ...original, content: 'My edits' }} />)
  fireEvent.click(screen.getByText('Import'))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(insert).toHaveBeenCalledWith('My edits')
  expect(onImported).toHaveBeenCalledTimes(1)
  expect(update).not.toHaveBeenCalled()
  expect(toast).toHaveBeenCalledWith('已在你的範本中，沿用既有範本', expect.any(Object))
  const action = jest.mocked(toast).mock.calls[0][1]!.action as Action
  action.onClick({} as Parameters<Action['onClick']>[0])
  expect(add).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Source（副本）', sourcePromptKey: undefined, sourcePromptFingerprint: undefined }))
  expect(insert).toHaveBeenCalledTimes(1)
})

it.each([false, true])('source changes require a choice; update=%s preserves identity', updateSource => {
  const value = { ...source, content: 'Upstream revision' }
  render(<Harness item={{ ...original, content: 'My edits' }} value={value} />)
  fireEvent.click(screen.getByText('Import'))
  expect(screen.getByRole('dialog', { name: '來源範本有新內容' })).toBeInTheDocument()
  expect(add).not.toHaveBeenCalled()
  expect(update).not.toHaveBeenCalled()
  expect(insert).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: updateSource ? '更新這份範本' : '保留我的版本' }))
  expect(update).toHaveBeenCalledWith('saved-id', expect.objectContaining({ content: updateSource ? value.content : 'My edits', sourcePromptFingerprint: galleryFingerprint(value) }))
  expect(insert).toHaveBeenCalledWith(updateSource ? value.content : 'My edits')
  expect(onImported).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('saving a copy from a source change never overwrites the saved version', () => {
  render(<Harness value={{ ...source, content: 'New source' }} />)
  fireEvent.click(screen.getByText('Import'))
  fireEvent.click(screen.getByRole('button', { name: '另存副本' }))
  expect(update).not.toHaveBeenCalled()
  expect(add).toHaveBeenCalledWith(expect.objectContaining({ content: 'New source', sourcePromptKey: undefined }))
  expect(insert).toHaveBeenCalledWith('New source')
  expect(onImported).toHaveBeenCalledTimes(1)
})

it('rejects stale copy actions after an account switch and on unmount', () => {
  const view = render(<Harness item={{ ...original, content: 'My edits' }} />)
  fireEvent.click(screen.getByText('Import'))
  const action = jest.mocked(toast).mock.calls[0][1]!.action as Action
  add.mockClear()
  view.rerender(<Harness scope="bob" />)
  action.onClick({} as Parameters<Action['onClick']>[0])
  expect(add).not.toHaveBeenCalled()
  view.rerender(<Harness />)
  view.unmount()
  action.onClick({} as Parameters<Action['onClick']>[0])
  expect(add).not.toHaveBeenCalled()
})

it('does not mistake a legacy difference for a confirmed source update', () => {
  render(<Harness item={{ ...original, content: 'Legacy edits', sourcePromptFingerprint: undefined }} />)
  fireEvent.click(screen.getByText('Import'))
  expect(screen.getByRole('dialog', { name: '來源與你的範本內容不同' })).toBeInTheDocument()
})

it('a full library cannot overwrite the original through save-copy', () => {
  render(<Harness value={{ ...source, content: 'Updated' }} />)
  fireEvent.click(screen.getByText('Import'))
  add.mockReturnValueOnce(null)
  fireEvent.click(screen.getByRole('button', { name: '另存副本' }))
  expect(update).not.toHaveBeenCalled()
  expect(insert).not.toHaveBeenCalled()
  expect(toast.error).toHaveBeenCalled()
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

it('a pending overwrite is discarded across role/account changes', () => {
  const view = render(<Harness value={{ ...source, content: 'Updated' }} />)
  fireEvent.click(screen.getByText('Import'))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  view.rerender(<Harness scope="bob" />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  view.rerender(<Harness />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(update).not.toHaveBeenCalled()
})

it('does not count a pending source decision that the user dismisses', () => {
  render(<Harness value={{ ...source, content: 'New source' }} />)
  fireEvent.click(screen.getByText('Import'))
  expect(onImported).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(onImported).not.toHaveBeenCalled()
  expect(add).not.toHaveBeenCalled()
  expect(insert).not.toHaveBeenCalled()
})
