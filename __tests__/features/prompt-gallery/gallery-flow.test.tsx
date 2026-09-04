import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { PromptGalleryDialog } from '@/features/prompt-gallery/components/PromptGalleryDialog'
import { PromptPreviewDialog } from '@/features/prompt-gallery/components/PromptPreviewDialog'
import { PromptCard } from '@/features/prompt-gallery/components/PromptCard'
import { SharePromptDialog } from '@/features/prompt-gallery/components/SharePromptDialog'
import { usePromptGallery } from '@/features/prompt-gallery/hooks/usePromptGallery'
import { createSharedPrompt, getSharedPrompts, getMySharedPrompts, loadSharedPromptContent } from '@/features/prompt-gallery/services/prompt-gallery.service'
import { useAuth } from '@/src/application/providers/auth.provider'
import type { SharedPrompt } from '@/features/prompt-gallery/types/prompt.types'

jest.mock('@/src/application/providers/language.provider', () => ({ useLanguage: () => ({ t: jest.requireActual('@/src/shared/i18n/locales/zh-TW').zhTW }) }))
jest.mock('@/src/application/providers/auth.provider', () => ({ useAuth: jest.fn() }))
jest.mock('@/src/application/providers/audience.provider', () => ({ useAudience: () => ({ audience: 'medical' }) }))
jest.mock('@/features/prompt-gallery/components/LoginRequiredDialog', () => ({ LoginRequiredDialog: () => null }))
jest.mock('@/features/prompt-gallery/services/prompt-gallery.service', () => ({
  createSharedPrompt: jest.fn(), getSharedPrompts: jest.fn(), getMySharedPrompts: jest.fn(),
  loadSharedPromptContent: jest.fn(), incrementPromptUsage: jest.fn(),
}))
const template: SharedPrompt = { id: 'source', title: '範本', prompt: 'Full source', types: ['summary'],
  category: 'summary', specialty: ['general'], audience: ['medical'], tags: [], createdAt: new Date(), updatedAt: new Date() }

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(useAuth).mockReturnValue({ user: { uid: 'alice', displayName: 'Alice', email: 'private@example.test' } } as ReturnType<typeof useAuth>)
  jest.mocked(getSharedPrompts).mockResolvedValue([])
  jest.mocked(getMySharedPrompts).mockResolvedValue([])
  jest.mocked(createSharedPrompt).mockResolvedValue('created')
  Element.prototype.scrollIntoView = jest.fn()
  Element.prototype.hasPointerCapture = jest.fn(() => false)
})
afterEach(() => jest.useRealTimers())

it('ignores out-of-order results and stale errors, and debounces search', async () => {
  jest.useFakeTimers()
  let resolveOld!: (value: SharedPrompt[]) => void
  let resolveNew!: (value: SharedPrompt[]) => void
  jest.mocked(getSharedPrompts)
    .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
    .mockImplementationOnce(() => new Promise(resolve => { resolveNew = resolve }))
  const { result } = renderHook(() => usePromptGallery({ searchQuery: 'old' }))
  act(() => jest.advanceTimersByTime(250))
  act(() => result.current.updateFilter({ searchQuery: 'n' }))
  act(() => result.current.updateFilter({ searchQuery: 'new' }))
  act(() => jest.advanceTimersByTime(249))
  expect(getSharedPrompts).toHaveBeenCalledTimes(1)
  act(() => jest.advanceTimersByTime(1))
  await act(async () => resolveNew([{ ...template, id: 'new' }]))
  await act(async () => resolveOld([{ ...template, id: 'old' }]))
  expect(result.current.prompts[0].id).toBe('new')
  expect(result.current.filter.searchQuery).toBe('new')
  expect(result.current.loading).toBe(false)
})

it('does not let an old error end the current loading state', async () => {
  jest.useFakeTimers()
  let rejectOld!: (reason: Error) => void
  let resolveNew!: (value: SharedPrompt[]) => void
  jest.mocked(getSharedPrompts)
    .mockImplementationOnce(() => new Promise((_, reject) => { rejectOld = reject }))
    .mockImplementationOnce(() => new Promise(resolve => { resolveNew = resolve }))
  const { result } = renderHook(() => usePromptGallery())
  act(() => jest.runOnlyPendingTimers())
  act(() => result.current.updateFilter({ specialty: 'nephrology' }))
  act(() => jest.runOnlyPendingTimers())
  await act(async () => rejectOld(new Error('old failure')))
  expect(result.current.loading).toBe(true)
  expect(result.current.error).toBeNull()
  await act(async () => resolveNew([template]))
  expect(result.current.loading).toBe(false)
})

it('loads only the visible gallery tab and defaults summary sharing to summary', async () => {
  const { rerender } = render(<PromptGalleryDialog open={false} onOpenChange={jest.fn()} onSelectPrompt={jest.fn()} mode="summary" />)
  expect(getSharedPrompts).not.toHaveBeenCalled()
  expect(getMySharedPrompts).not.toHaveBeenCalled()
  rerender(<PromptGalleryDialog open onOpenChange={jest.fn()} onSelectPrompt={jest.fn()} mode="summary" />)
  await waitFor(() => expect(getSharedPrompts).toHaveBeenCalledTimes(1))
  expect(getMySharedPrompts).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '分享範本' }))
  const share = screen.getByRole('dialog', { name: '分享範本' })
  fireEvent.change(within(share).getByRole('textbox', { name: '標題 *' }), { target: { value: 'Summary' } })
  fireEvent.change(within(share).getByRole('textbox', { name: 'Prompt 內容 *' }), { target: { value: 'Summarize' } })
  fireEvent.click(within(share).getByRole('button', { name: '分享範本' }))
  await waitFor(() => expect(createSharedPrompt).toHaveBeenCalledWith(expect.objectContaining({ types: ['summary'], category: 'summary' })))
})

it('never substitutes an account email for a missing public name', async () => {
  jest.mocked(useAuth).mockReturnValue({ user: { uid: 'alice', displayName: null, email: 'private@example.test' } } as ReturnType<typeof useAuth>)
  render(<SharePromptDialog open onOpenChange={jest.fn()} initialTitle="Test" initialPrompt="Full content" />)
  expect(screen.queryByText('private@example.test')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '分享範本' }))
  await waitFor(() => expect(createSharedPrompt).toHaveBeenCalledWith(expect.objectContaining({ isAnonymous: true, authorName: undefined })))
})

it('completes one share without a delayed callback closing the next draft', async () => {
  jest.useFakeTimers()
  function Host() {
    const [open, setOpen] = useState(true)
    return <><button onClick={() => setOpen(true)}>再分享</button><SharePromptDialog open={open} onOpenChange={setOpen} initialTitle="Test" initialPrompt="Source" /></>
  }
  render(<Host />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '分享範本' })))
  expect(screen.queryByRole('dialog', { name: '分享範本' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '再分享' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Prompt 內容 *' }), { target: { value: 'NEXT DRAFT' } })
  act(() => jest.advanceTimersByTime(2000))
  expect(screen.getByRole('textbox', { name: 'Prompt 內容 *' })).toHaveValue('NEXT DRAFT')
})

it('keeps the full draft when publishing fails', async () => {
  const onClose = jest.fn()
  jest.mocked(createSharedPrompt).mockRejectedValue(new Error('offline'))
  const long = '中'.repeat(400000)
  render(<SharePromptDialog open onOpenChange={onClose} initialTitle="Test" initialPrompt={long} />)
  fireEvent.click(screen.getByRole('button', { name: '分享範本' }))
  expect(await screen.findByText('offline')).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Prompt 內容 *' })).toHaveValue(long)
  expect(onClose).not.toHaveBeenCalled()
})

it('preserves meaningful leading and trailing prompt whitespace', async () => {
  const source = '\n    Indented example\n\n'
  render(<SharePromptDialog open onOpenChange={jest.fn()} initialTitle="Whitespace" initialPrompt={source} />)
  fireEvent.click(screen.getByRole('button', { name: '分享範本' }))
  await waitFor(() => expect(createSharedPrompt).toHaveBeenCalledWith(expect.objectContaining({ prompt: source })))
})

it('does not apply an excerpt while loading and only passes complete content to consumers', async () => {
  let resolve!: (value: SharedPrompt) => void
  jest.mocked(loadSharedPromptContent).mockImplementation(() => new Promise(done => { resolve = done }))
  const onUse = jest.fn()
  const excerpt = { ...template, prompt: 'Preview', body: { id: 'body', chunks: 7, length: 400000 } }
  render(<PromptPreviewDialog open prompt={excerpt} onOpenChange={jest.fn()} onUse={onUse} />)
  expect(screen.getByRole('region', { name: 'Prompt 內容' })).toHaveAttribute('tabindex', '0')
  expect(screen.getByRole('button', { name: '使用' })).toBeDisabled()
  const full = { ...template, prompt: '中'.repeat(400000) }
  await act(async () => resolve(full))
  fireEvent.click(screen.getByRole('button', { name: '使用' }))
  expect(onUse).toHaveBeenCalledWith(full, 'summary')
})

it('offers retry for incomplete content while keeping use disabled', async () => {
  jest.mocked(loadSharedPromptContent).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(template)
  render(<PromptPreviewDialog open prompt={{ ...template, body: { id: 'body', chunks: 2, length: 400000 } }} onOpenChange={jest.fn()} onUse={jest.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: '重試' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '使用' })).toBeEnabled())
})

it.each(['Enter', ' '])('opens a card with the %s key', key => {
  const onPreview = jest.fn()
  render(<PromptCard prompt={template} onPreview={onPreview} />)
  const card = screen.getByRole('button', { name: '範本' })
  expect(card).toHaveAttribute('tabindex', '0')
  fireEvent.keyDown(card, { key })
  expect(onPreview).toHaveBeenCalledWith(template)
})

it('returns keyboard focus to the originating card after preview closes', async () => {
  jest.mocked(getSharedPrompts).mockResolvedValue([template])
  render(<PromptGalleryDialog open onOpenChange={jest.fn()} onSelectPrompt={jest.fn()} />)
  const card = await screen.findByRole('button', { name: '範本' })
  card.focus()
  fireEvent.keyDown(card, { key: 'Enter' })
  fireEvent.click(screen.getByRole('button', { name: '關閉' }))
  await waitFor(() => expect(card).toHaveFocus())
})
