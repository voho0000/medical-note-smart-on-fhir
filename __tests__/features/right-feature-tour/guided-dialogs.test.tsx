import { fireEvent, render, screen, within } from '@testing-library/react'
import { PromptGalleryDialog } from '@/features/prompt-gallery/components/PromptGalleryDialog'
import { SharePromptDialog } from '@/features/prompt-gallery/components/SharePromptDialog'
import { createSharedPrompt, deleteSharedPrompt } from '@/features/prompt-gallery/services/prompt-gallery.service'
import { usePromptGallery } from '@/features/prompt-gallery/hooks/usePromptGallery'
import type { SharedPrompt } from '@/features/prompt-gallery/types/prompt.types'

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({ locale: 'zh-TW', t: jest.requireActual('@/src/shared/i18n/locales/zh-TW').zhTW }),
}))
jest.mock('@/src/application/providers/auth.provider', () => ({
  useAuth: () => ({ user: { uid: 'tour-test-author', displayName: 'Test author' } }),
}))
jest.mock('@/src/application/providers/audience.provider', () => ({ useAudience: () => ({ audience: 'medical' }) }))
jest.mock('@/features/prompt-gallery/services/prompt-gallery.service', () => ({
  createSharedPrompt: jest.fn(), deleteSharedPrompt: jest.fn(),
}))
jest.mock('@/features/prompt-gallery/hooks/usePromptGallery', () => ({ usePromptGallery: jest.fn() }))
jest.mock('@/features/prompt-gallery/components/LoginRequiredDialog', () => ({ LoginRequiredDialog: () => null }))

const template: SharedPrompt = {
  id: 'tour-test-template', title: '測試用摘要模板', description: '用於導覽測試，不含病人資料',
  prompt: 'Compare the available results without inventing missing values.',
  types: ['summary'], category: 'summary', specialty: ['general'], audience: ['medical'], tags: [],
  authorId: 'tour-test-author', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
}

function galleryState(overrides: Partial<ReturnType<typeof usePromptGallery>> = {}): ReturnType<typeof usePromptGallery> {
  return {
    prompts: [template], loading: false, error: null, filter: { audience: 'medical', type: 'summary' },
    sort: { field: 'createdAt', direction: 'desc' }, updateFilter: jest.fn(), clearFilter: jest.fn(),
    updateSort: jest.fn(), fetchPrompts: jest.fn(), trackUsage: jest.fn(), ...overrides,
  }
}

describe('read-only guided dialogs', () => {
  beforeEach(() => jest.clearAllMocks())

  it('opens the real populated library and preview without adding, tracking usage, or deleting', () => {
    const state = galleryState()
    jest.mocked(usePromptGallery).mockReturnValue(state)
    const onSelectPrompt = jest.fn()
    render(<PromptGalleryDialog open onOpenChange={jest.fn()} mode="summary" onSelectPrompt={onSelectPrompt} guidedPreview previewFirstTemplate />)
    expect(screen.getByRole('tab', { name: '所有範本' })).toHaveAttribute('aria-selected', 'true')
    expect(usePromptGallery).toHaveBeenCalledWith({ initialFilter: { audience: 'medical', type: 'summary' }, enabled: true })
    const preview = screen.getByRole('dialog', { name: template.title })
    expect(within(preview).getByText(template.prompt)).toBeInTheDocument()
    const add = within(preview).getByRole('button', { name: '加入自訂摘要' })
    const remove = within(preview).getByRole('button', { name: '刪除' })
    expect(add).toBeDisabled()
    expect(remove).toBeDisabled()
    fireEvent.click(add)
    fireEvent.click(remove)
    expect(onSelectPrompt).not.toHaveBeenCalled()
    expect(state.trackUsage).not.toHaveBeenCalled()
    expect(deleteSharedPrompt).not.toHaveBeenCalled()
  })

  it.each([
    ['loading', { loading: true }],
    ['empty', { prompts: [] as SharedPrompt[] }],
    ['error', { error: 'Library unavailable' }],
  ] as const)('keeps the library visible without a fabricated preview when %s', (_name, overrides) => {
    jest.mocked(usePromptGallery).mockReturnValue(galleryState(overrides))
    render(<PromptGalleryDialog open onOpenChange={jest.fn()} onSelectPrompt={jest.fn()} guidedPreview previewFirstTemplate />)
    expect(screen.getByRole('tab', { name: '所有範本' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('搜尋 Prompt...')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: template.title })).not.toBeInTheDocument()
  })

  it('shows the signed-in sharing form with source fields but disables publication', () => {
    const onSuccess = jest.fn()
    render(<SharePromptDialog open onOpenChange={jest.fn()} initialTitle={template.title} initialPrompt={template.prompt} initialType="summary" guidedPreview onSuccess={onSuccess} />)
    expect(screen.getByDisplayValue(template.title)).toBeInTheDocument()
    expect(screen.getByDisplayValue(template.prompt)).toBeInTheDocument()
    expect(document.querySelector('[data-tour="template-share-review"]')).toBeInTheDocument()
    const share = screen.getByRole('button', { name: '分享範本' })
    expect(share).toBeDisabled()
    fireEvent.click(share)
    expect(createSharedPrompt).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('leaves normal template sharing available outside a guided preview', () => {
    render(<SharePromptDialog open onOpenChange={jest.fn()} initialTitle={template.title} initialPrompt={template.prompt} initialType="summary" />)
    expect(screen.getByRole('button', { name: '分享範本' })).toBeEnabled()
  })
})
