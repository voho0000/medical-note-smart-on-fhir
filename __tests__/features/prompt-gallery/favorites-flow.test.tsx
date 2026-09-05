import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { PromptGalleryDialog } from '@/features/prompt-gallery/components/PromptGalleryDialog'
import { getSharedPrompts, getMySharedPrompts, loadSharedPromptContent } from '@/features/prompt-gallery/services/prompt-gallery.service'
import { removePromptFavorite, savePromptFavorite, subscribePromptFavorites } from '@/features/prompt-gallery/services/prompt-favorites.service'
import { toPromptFavorite } from '@/features/prompt-gallery/utils/prompt-favorite.utils'
import { useAuth } from '@/src/application/providers/auth.provider'
import type { PromptFavorite, SharedPrompt } from '@/features/prompt-gallery/types/prompt.types'

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
jest.mock('@/src/application/providers/language.provider', () => ({ useLanguage: () => ({ t: jest.requireActual('@/src/shared/i18n/locales/zh-TW').zhTW }) }))
jest.mock('@/src/application/providers/auth.provider', () => ({ useAuth: jest.fn() }))
jest.mock('@/src/application/providers/audience.provider', () => ({ useAudience: () => ({ audience: 'medical' }) }))
jest.mock('@/features/prompt-gallery/components/LoginRequiredDialog', () => ({
  LoginRequiredDialog: ({ open, title }: { open: boolean; title?: string }) => open ? <div role="dialog" aria-label={title} /> : null,
}))
jest.mock('@/features/prompt-gallery/services/prompt-gallery.service', () => ({
  createSharedPrompt: jest.fn(), getSharedPrompts: jest.fn(), getMySharedPrompts: jest.fn(),
  loadSharedPromptContent: jest.fn(), incrementPromptUsage: jest.fn(), EXAMPLE_OUTPUT_MAX_LENGTH: 20000,
}))
jest.mock('@/features/prompt-gallery/services/prompt-favorites.service', () => ({
  subscribePromptFavorites: jest.fn(), savePromptFavorite: jest.fn(), removePromptFavorite: jest.fn(), getPromptFavorites: jest.fn(),
}))

const template = (overrides: Partial<SharedPrompt> = {}): SharedPrompt => ({
  id: 'source', title: '範本', description: '說明', prompt: 'Full source', types: ['summary'], category: 'summary',
  specialty: ['general'], audience: ['medical'], tags: [], usageCount: 1,
  createdAt: new Date('2026-06-01T00:00:00Z'), updatedAt: new Date('2026-06-01T00:00:00Z'), ...overrides,
})
let emitFavorites: (favorites: PromptFavorite[]) => void
// Radix tabs activate on pointer down, not click.
const selectTab = (name: string | RegExp) => {
  const tab = screen.getByRole('tab', { name })
  fireEvent.mouseDown(tab)
  fireEvent.click(tab)
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class { observe() {} unobserve() {} disconnect() {} },
  })
})

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(useAuth).mockReturnValue({ user: { uid: 'alice', displayName: 'Alice' }, isAnonymous: false } as unknown as ReturnType<typeof useAuth>)
  jest.mocked(getSharedPrompts).mockResolvedValue([])
  jest.mocked(getMySharedPrompts).mockResolvedValue([])
  jest.mocked(loadSharedPromptContent).mockImplementation(async prompt => prompt)
  jest.mocked(savePromptFavorite).mockResolvedValue(true)
  jest.mocked(removePromptFavorite).mockResolvedValue(true)
  jest.mocked(subscribePromptFavorites).mockImplementation((_userId, onUpdate) => { emitFavorites = onUpdate; onUpdate([]); return jest.fn() })
  Element.prototype.scrollIntoView = jest.fn()
  Element.prototype.hasPointerCapture = jest.fn(() => false)
})

const renderGallery = () => render(<PromptGalleryDialog open onOpenChange={jest.fn()} onSelectPrompt={jest.fn()} />)

it('adds and removes a favorite from the row heart with a toast, without opening the preview', async () => {
  jest.mocked(getSharedPrompts).mockResolvedValue([template()])
  renderGallery()
  const row = await screen.findByRole('button', { name: '範本' })
  const heart = within(row).getByRole('button', { name: '加入我的最愛' })
  expect(heart).toHaveAttribute('aria-pressed', 'false')

  fireEvent.click(heart)
  await waitFor(() => expect(savePromptFavorite).toHaveBeenCalledWith('alice', expect.objectContaining({ id: 'source', prompt: expect.objectContaining({ title: '範本', prompt: 'Full source' }) })))
  expect(toast.success).toHaveBeenCalledWith('已加入我的最愛')
  expect(screen.queryByRole('dialog', { name: '範本' })).not.toBeInTheDocument()
  const pressed = within(row).getByRole('button', { name: '移除我的最愛' })
  expect(pressed).toHaveAttribute('aria-pressed', 'true')

  fireEvent.click(pressed)
  await waitFor(() => expect(removePromptFavorite).toHaveBeenCalledWith('alice', 'source'))
  expect(toast.success).toHaveBeenCalledWith('已從我的最愛移除')
  expect(within(row).getByRole('button', { name: '加入我的最愛' })).toHaveAttribute('aria-pressed', 'false')
})

it('lists saved copies across sources in the favorites tab, even when the source is gone, and marks newer sources', async () => {
  const live = template({ updatedAt: new Date('2026-08-30T00:00:00Z') })
  jest.mocked(getSharedPrompts).mockResolvedValue([live])
  renderGallery()
  await screen.findByRole('button', { name: '範本' })
  const saved = toPromptFavorite(template(), new Date('2026-07-01T00:00:00Z'))
  const orphan = toPromptFavorite(template({ id: 'gone', title: '已被刪除的來源', authorId: 'alice' }), new Date('2026-07-02T00:00:00Z'))
  act(() => emitFavorites([orphan, saved]))

  expect(screen.getByRole('tab', { name: /我的最愛/ })).toHaveTextContent('2')
  selectTab(/我的最愛/)
  const rows = screen.getAllByRole('button', { name: /^(範本|已被刪除的來源)$/ })
  expect(rows.map(row => row.getAttribute('aria-label'))).toEqual(['已被刪除的來源', '範本'])
  expect(within(rows[1]).getByText('已更新')).toBeInTheDocument()
  expect(within(rows[0]).queryByText('已更新')).not.toBeInTheDocument()
  expect(within(rows[0]).getByText('我的範本')).toBeInTheDocument()
  expect(within(rows[1]).getByText('共享範本')).toBeInTheDocument()

  fireEvent.click(within(rows[0]).getByRole('button', { name: '移除我的最愛' }))
  await waitFor(() => expect(removePromptFavorite).toHaveBeenCalledWith('alice', 'gone'))
  expect(screen.queryByRole('button', { name: '已被刪除的來源' })).not.toBeInTheDocument()
})

it('shows the empty favorites state and asks anonymous sessions to sign in before saving', async () => {
  jest.mocked(getSharedPrompts).mockResolvedValue([template()])
  const { unmount } = renderGallery()
  await screen.findByRole('button', { name: '範本' })
  selectTab('我的最愛')
  expect(screen.getByText('尚未加入常用 Prompt')).toBeInTheDocument()
  expect(screen.getByText('瀏覽範本時點擊愛心，即可在這裡快速找到。')).toBeInTheDocument()
  unmount()

  jest.mocked(useAuth).mockReturnValue({ user: { uid: 'anon' }, isAnonymous: true } as unknown as ReturnType<typeof useAuth>)
  render(<PromptGalleryDialog open onOpenChange={jest.fn()} onSelectPrompt={jest.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: '加入我的最愛' }))
  // The mocked login dialog renders outside the modal portal, which Radix marks aria-hidden.
  expect(screen.getByRole('dialog', { name: '收藏需要登入', hidden: true })).toBeInTheDocument()
  expect(subscribePromptFavorites).not.toHaveBeenCalledWith('anon', expect.anything())
  expect(savePromptFavorite).not.toHaveBeenCalled()
})

it('renders every prompt in one scrolling table and sorts by a column header', async () => {
  jest.mocked(getSharedPrompts).mockResolvedValue(Array.from({ length: 20 }, (_, index) =>
    template({ id: `p${index}`, title: `範本 ${index}`, usageCount: index, createdAt: new Date(2026, 0, index + 1) })))
  renderGallery()
  await screen.findByRole('button', { name: '範本 0' })
  const titles = () => screen.getAllByRole('button', { name: /^範本 \d+$/ }).map(row => row.getAttribute('aria-label'))
  expect(titles()).toHaveLength(20)
  expect(titles()[0]).toBe('範本 19')
  expect(screen.queryByRole('button', { name: '下一頁' })).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '依 使用 排序' }))
  expect(titles()[0]).toBe('範本 19')
  fireEvent.click(screen.getByRole('button', { name: '依 使用 排序' }))
  expect(titles()[0]).toBe('範本 0')
  fireEvent.click(screen.getByRole('button', { name: '依 範本 排序' }))
  expect(titles()[0]).toBe('範本 0')
  expect(screen.getByText('20 筆')).toBeInTheDocument()
})

it('opens the preview with the heart beside the title and the example output beside the prompt', async () => {
  jest.mocked(getSharedPrompts).mockResolvedValue([template({ exampleOutput: '## 範例輸出' })])
  renderGallery()
  fireEvent.click(await screen.findByRole('button', { name: '範本' }))
  const dialog = await screen.findByRole('dialog', { name: '範本' })
  expect(within(dialog).getByRole('region', { name: 'Prompt 內容' })).toHaveTextContent('Full source')
  expect(within(dialog).getByRole('region', { name: '輸出範例' })).toHaveTextContent('## 範例輸出')
  fireEvent.click(within(dialog).getByRole('button', { name: '加入我的最愛' }))
  await waitFor(() => expect(savePromptFavorite).toHaveBeenCalledTimes(1))
  expect(within(dialog).getByRole('button', { name: '移除我的最愛' })).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: '使用' })).toBeEnabled()
})
