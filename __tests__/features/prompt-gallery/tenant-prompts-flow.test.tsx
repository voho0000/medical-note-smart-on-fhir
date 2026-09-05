import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { PromptGalleryDialog } from '@/features/prompt-gallery/components/PromptGalleryDialog'
import { getSharedPrompts, getMySharedPrompts, loadSharedPromptContent, createSharedPrompt } from '@/features/prompt-gallery/services/prompt-gallery.service'
import { subscribeTenantMemberships } from '@/features/prompt-gallery/services/tenant-memberships.service'
import { createTenantPrompt, getTenantPrompts, incrementTenantPromptUsage } from '@/features/prompt-gallery/services/tenant-prompts.service'
import { useAuth } from '@/src/application/providers/auth.provider'
import type { SharedPrompt, TenantMembership } from '@/features/prompt-gallery/types/prompt.types'

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
  subscribePromptFavorites: jest.fn((_userId: string, onUpdate: (favorites: never[]) => void) => { onUpdate([]); return jest.fn() }),
  savePromptFavorite: jest.fn(), removePromptFavorite: jest.fn(), getPromptFavorites: jest.fn(),
}))
jest.mock('@/features/prompt-gallery/services/tenant-memberships.service', () => ({ subscribeTenantMemberships: jest.fn() }))
jest.mock('@/features/prompt-gallery/services/tenant-prompts.service', () => ({
  getTenantPrompts: jest.fn(), createTenantPrompt: jest.fn(), deleteTenantPrompt: jest.fn(), incrementTenantPromptUsage: jest.fn(),
}))

const template = (overrides: Partial<SharedPrompt> = {}): SharedPrompt => ({
  id: 'public', title: '公開範本', prompt: 'Public source', types: ['summary'], category: 'summary',
  specialty: ['general'], audience: ['medical'], tags: [], usageCount: 1,
  createdAt: new Date('2026-06-01T00:00:00Z'), updatedAt: new Date('2026-06-01T00:00:00Z'), ...overrides,
})
const cardiology: TenantMembership = { tenantId: 'cardio', role: 'builder', displayName: '心臟內科', canPublish: true }
const nephrology: TenantMembership = { tenantId: 'nephro', role: 'member', displayName: '腎臟內科', canPublish: false }
let emitMemberships: (memberships: TenantMembership[]) => void
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
  jest.mocked(useAuth).mockReturnValue({ user: { uid: 'alice', displayName: 'Alice' }, isAnonymous: false } as unknown as ReturnType<typeof useAuth>)
  jest.mocked(getSharedPrompts).mockResolvedValue([template()])
  jest.mocked(getMySharedPrompts).mockResolvedValue([])
  jest.mocked(loadSharedPromptContent).mockImplementation(async prompt => prompt)
  jest.mocked(getTenantPrompts).mockResolvedValue([])
  jest.mocked(createTenantPrompt).mockResolvedValue('new-tenant-prompt')
  jest.mocked(createSharedPrompt).mockResolvedValue('new-public-prompt')
  jest.mocked(subscribeTenantMemberships).mockImplementation((_userId, onUpdate) => { emitMemberships = onUpdate; onUpdate([]); return jest.fn() })
  Element.prototype.scrollIntoView = jest.fn()
  Element.prototype.hasPointerCapture = jest.fn(() => false)
})

const renderGallery = () => render(<PromptGalleryDialog open onOpenChange={jest.fn()} onSelectPrompt={jest.fn()} />)

it('shows the department tab only for accounts with an active membership', async () => {
  renderGallery()
  await screen.findByRole('button', { name: '公開範本' })
  expect(screen.queryByRole('tab', { name: /科常用範本/ })).not.toBeInTheDocument()
  act(() => emitMemberships([cardiology]))
  expect(screen.getByRole('tab', { name: /科常用範本/ })).toBeInTheDocument()
  expect(getTenantPrompts).not.toHaveBeenCalled()
})

it('lists the department templates with the department name and counts a use against the department copy', async () => {
  const onSelect = jest.fn()
  jest.mocked(getTenantPrompts).mockResolvedValue([template({ id: 'hf', title: '心衰竭門診追蹤', types: ['chat'], tenantId: 'cardio', authorId: 'bob', usageCount: 12 })])
  render(<PromptGalleryDialog open onOpenChange={jest.fn()} onSelectPrompt={onSelect} mode="chat" />)
  await screen.findByRole('button', { name: '公開範本' })
  act(() => emitMemberships([cardiology, nephrology]))
  selectTab(/科常用範本/)
  await waitFor(() => expect(getTenantPrompts).toHaveBeenCalledWith('cardio'))
  const row = await screen.findByRole('button', { name: '心衰竭門診追蹤' })
  // The department tab is single-source, so the source column is hidden there; the preview still names it.
  expect(within(row).queryByText('心臟內科常用')).not.toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: '科別' })).toHaveTextContent('心臟內科')
  expect(screen.queryByRole('button', { name: '公開範本' })).not.toBeInTheDocument()

  fireEvent.click(row)
  const preview = await screen.findByRole('dialog', { name: '心衰竭門診追蹤' })
  expect(within(preview).getByText('心臟內科常用')).toBeInTheDocument()
  fireEvent.click(within(preview).getByRole('button', { name: '關閉' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '心衰竭門診追蹤' })).not.toBeInTheDocument())

  fireEvent.click(within(row).getByRole('button', { name: '帶入: 心衰竭門診追蹤' }))
  await waitFor(() => expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'hf', tenantId: 'cardio' }), 'chat'))
  expect(incrementTenantPromptUsage).toHaveBeenCalledWith('hf')
})

it('shows the empty department state and lets a builder publish to the department from the share form', async () => {
  renderGallery()
  await screen.findByRole('button', { name: '公開範本' })
  act(() => emitMemberships([cardiology]))
  selectTab(/科常用範本/)
  expect(await screen.findByText('這個科別還沒有常用範本')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '分享範本' }))
  const share = screen.getByRole('dialog', { name: '分享範本' })
  expect(within(share).getByRole('combobox', { name: '發布到' })).toHaveTextContent('心臟內科 科常用範本')
  fireEvent.change(within(share).getByRole('textbox', { name: '標題 *' }), { target: { value: '心導管術後記錄' } })
  fireEvent.change(within(share).getByRole('textbox', { name: 'Prompt 內容 *' }), { target: { value: '依穿刺部位撰寫' } })
  fireEvent.click(within(share).getByRole('button', { name: '分享範本' }))
  await waitFor(() => expect(createTenantPrompt).toHaveBeenCalledWith(expect.objectContaining({ title: '心導管術後記錄', tenantId: 'cardio', authorId: 'alice' })))
  expect(createSharedPrompt).not.toHaveBeenCalled()
  await waitFor(() => expect(getTenantPrompts).toHaveBeenCalledTimes(2))
})

it('offers no department target to a member who cannot publish', async () => {
  renderGallery()
  await screen.findByRole('button', { name: '公開範本' })
  act(() => emitMemberships([nephrology]))
  fireEvent.click(screen.getByRole('button', { name: '分享範本' }))
  const share = screen.getByRole('dialog', { name: '分享範本' })
  expect(within(share).queryByRole('combobox', { name: '發布到' })).not.toBeInTheDocument()
})
