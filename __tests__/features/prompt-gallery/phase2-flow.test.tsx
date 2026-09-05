import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { PromptGalleryDialog } from '@/features/prompt-gallery/components/PromptGalleryDialog'
import { getSharedPrompts, getMySharedPrompts, loadSharedPromptContent } from '@/features/prompt-gallery/services/prompt-gallery.service'
import { subscribePromptFavorites } from '@/features/prompt-gallery/services/prompt-favorites.service'
import { toPromptFavorite } from '@/features/prompt-gallery/utils/prompt-favorite.utils'
import { useAuth } from '@/src/application/providers/auth.provider'
import type { PromptFavorite, SharedPrompt } from '@/features/prompt-gallery/types/prompt.types'

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
jest.mock('@/src/application/providers/language.provider', () => ({ useLanguage: () => ({ t: jest.requireActual('@/src/shared/i18n/locales/zh-TW').zhTW }) }))
jest.mock('@/src/application/providers/auth.provider', () => ({ useAuth: jest.fn() }))
jest.mock('@/src/application/providers/audience.provider', () => ({ useAudience: () => ({ audience: 'medical' }) }))
jest.mock('@/features/prompt-gallery/components/LoginRequiredDialog', () => ({ LoginRequiredDialog: () => null }))
jest.mock('@/features/prompt-gallery/services/prompt-gallery.service', () => ({
  createSharedPrompt: jest.fn(), getSharedPrompts: jest.fn(), getMySharedPrompts: jest.fn(),
  loadSharedPromptContent: jest.fn(), incrementPromptUsage: jest.fn(), EXAMPLE_OUTPUT_MAX_LENGTH: 20000,
}))
jest.mock('@/features/prompt-gallery/services/prompt-favorites.service', () => ({
  subscribePromptFavorites: jest.fn(), savePromptFavorite: jest.fn(), removePromptFavorite: jest.fn(), getPromptFavorites: jest.fn(),
}))
jest.mock('@/features/prompt-gallery/services/tenant-memberships.service', () => ({
  subscribeTenantMemberships: jest.fn((_userId: string, onUpdate: (memberships: never[]) => void) => { onUpdate([]); return jest.fn() }),
}))
jest.mock('@/features/prompt-gallery/services/tenant-prompts.service', () => ({
  getTenantPrompts: jest.fn(async () => []), createTenantPrompt: jest.fn(), deleteTenantPrompt: jest.fn(), incrementTenantPromptUsage: jest.fn(),
}))

const template = (overrides: Partial<SharedPrompt> = {}): SharedPrompt => ({
  id: 'drug', title: '通用藥物指導', prompt: '我剛開立了 {{藥物名稱}}。請為 [目標讀者] 寫衛教。', types: ['chat'], category: 'other',
  specialty: ['general'], audience: ['medical'], tags: [], usageCount: 1,
  createdAt: new Date('2026-06-01T00:00:00Z'), updatedAt: new Date('2026-06-01T00:00:00Z'), ...overrides,
})
let emitFavorites: (favorites: PromptFavorite[]) => void
const selectTab = (name: string | RegExp) => {
  const tab = screen.getByRole('tab', { name })
  fireEvent.mouseDown(tab)
  fireEvent.click(tab)
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: class { observe() {} unobserve() {} disconnect() {} } })
})
beforeEach(() => {
  jest.clearAllMocks()
  window.localStorage.clear()
  jest.mocked(useAuth).mockReturnValue({ user: { uid: 'alice', displayName: 'Alice' }, isAnonymous: false } as unknown as ReturnType<typeof useAuth>)
  jest.mocked(getSharedPrompts).mockResolvedValue([template(), template({ id: 'plain', title: '無變數範本', prompt: 'Plain text' })])
  jest.mocked(getMySharedPrompts).mockResolvedValue([])
  jest.mocked(loadSharedPromptContent).mockImplementation(async prompt => prompt)
  jest.mocked(subscribePromptFavorites).mockImplementation((_userId, onUpdate) => { emitFavorites = onUpdate; onUpdate([]); return jest.fn() })
  Element.prototype.scrollIntoView = jest.fn()
  Element.prototype.hasPointerCapture = jest.fn(() => false)
})

it('turns placeholders into fields, previews the substitution live and brings the filled prompt in', async () => {
  const onSelect = jest.fn()
  render(<PromptGalleryDialog open onOpenChange={jest.fn()} onSelectPrompt={onSelect} mode="chat" />)
  fireEvent.click(await screen.findByRole('button', { name: '通用藥物指導' }))
  const preview = await screen.findByRole('dialog', { name: '通用藥物指導' })
  const drug = within(preview).getByRole('textbox', { name: '藥物名稱 *' })
  const reader = within(preview).getByRole('textbox', { name: '目標讀者 *' })

  fireEvent.click(within(preview).getByRole('button', { name: '加入對話範本' }))
  expect(within(preview).getByRole('alert')).toHaveTextContent('尚未填寫：藥物名稱、目標讀者')
  expect(drug).toHaveAttribute('aria-invalid', 'true')
  expect(onSelect).not.toHaveBeenCalled()

  fireEvent.change(drug, { target: { value: 'Apixaban 5 mg' } })
  expect(within(preview).getByRole('region', { name: 'Prompt 內容' })).toHaveTextContent('我剛開立了 Apixaban 5 mg。請為 [目標讀者] 寫衛教。')
  expect(drug).not.toHaveAttribute('aria-invalid')
  fireEvent.change(reader, { target: { value: '家屬' } })
  fireEvent.click(within(preview).getByRole('button', { name: '加入對話範本' }))
  await waitFor(() => expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'drug', prompt: '我剛開立了 Apixaban 5 mg。請為 家屬 寫衛教。' }), 'chat'))
  // Only the id and time were remembered, never the values.
  expect(window.localStorage.getItem('mediprisma.promptGallery.recent.alice')).not.toContain('Apixaban')
})

it('lets the user skip the fill-in, and resets fields', async () => {
  const onSelect = jest.fn()
  render(<PromptGalleryDialog open onOpenChange={jest.fn()} onSelectPrompt={onSelect} mode="chat" />)
  fireEvent.click(await screen.findByRole('button', { name: '通用藥物指導' }))
  const preview = await screen.findByRole('dialog', { name: '通用藥物指導' })
  fireEvent.change(within(preview).getByRole('textbox', { name: '藥物名稱 *' }), { target: { value: 'x' } })
  fireEvent.click(within(preview).getByRole('button', { name: '重設欄位' }))
  expect(within(preview).getByRole('textbox', { name: '藥物名稱 *' })).toHaveValue('')
  fireEvent.click(within(preview).getByRole('button', { name: '加入對話範本' }))
  fireEvent.click(within(preview).getByRole('button', { name: '略過填空，直接帶入' }))
  await waitFor(() => expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ prompt: '我剛開立了 {{藥物名稱}}。請為 [目標讀者] 寫衛教。' }), 'chat'))
})

it('remembers recently previewed prompts as quick chips, orders favorites by recent use, and clears', async () => {
  render(<PromptGalleryDialog open onOpenChange={jest.fn()} onSelectPrompt={jest.fn()} />)
  await screen.findByRole('button', { name: '通用藥物指導' })
  expect(screen.queryByText('最近使用')).not.toBeInTheDocument()
  act(() => emitFavorites([toPromptFavorite(template(), new Date('2026-07-02T00:00:00Z')), toPromptFavorite(template({ id: 'plain', title: '無變數範本', prompt: 'Plain text' }), new Date('2026-07-01T00:00:00Z'))]))

  fireEvent.click(screen.getByRole('button', { name: '無變數範本' }))
  const preview = await screen.findByRole('dialog', { name: '無變數範本' })
  fireEvent.click(within(preview).getByRole('button', { name: '關閉' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '無變數範本' })).not.toBeInTheDocument())
  expect(screen.getByText('最近使用')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '最近使用: 無變數範本' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '最近使用: 通用藥物指導' })).not.toBeInTheDocument()

  selectTab(/我的最愛/)
  const rows = screen.getAllByRole('button', { name: /^(通用藥物指導|無變數範本)$/ }).map((row) => row.getAttribute('aria-label'))
  expect(rows[0]).toBe('無變數範本')

  fireEvent.click(screen.getByRole('button', { name: '清除' }))
  expect(screen.queryByText('最近使用')).not.toBeInTheDocument()
  expect(window.localStorage.getItem('mediprisma.promptGallery.recent.alice')).toBeNull()
})
