import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SharePromptDialog } from '@/features/prompt-gallery/components/SharePromptDialog'
import { createSharedPrompt, getSharedPrompt } from '@/features/prompt-gallery/services/prompt-gallery.service'
import { memory } from './fixtures/firestore-memory'

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    locale: 'zh-TW',
    t: jest.requireActual('@/src/shared/i18n/locales/zh-TW').zhTW,
  }),
}))
jest.mock('@/src/application/providers/auth.provider', () => ({
  useAuth: () => ({ user: { uid: 'example-author', displayName: 'Test author' } }),
}))
jest.mock('@/src/application/providers/audience.provider', () => ({
  useAudience: () => ({ audience: 'medical' }),
}))
jest.mock('@/src/shared/config/firebase.config', () => ({ db: {} }))
jest.mock('firebase/firestore', () => jest.requireActual('./fixtures/firestore-memory').firestore)
jest.mock('@/features/prompt-gallery/hooks/useDemoExampleOutput', () => ({
  useDemoExampleOutput: () => jest.fn(),
}))
jest.mock('@/features/prompt-gallery/services/tenant-prompts.service', () => ({
  createTenantPrompt: jest.fn(),
}))

beforeEach(() => memory.reset())

it.each(['', '   '])('clears description %p through the edit form and reads it back empty', async (emptyValue) => {
  const id = await createSharedPrompt({
    title: '測試範本', description: '門診摘要用', prompt: '請摘要病人資料',
    types: ['summary'], category: 'summary', specialty: ['general'], audience: ['medical'],
    tags: [], authorId: 'example-author', isPublic: false, exampleOutput: '測試範例',
  })
  const onSuccess = jest.fn()
  const props = {
    open: true, onOpenChange: jest.fn(), editingPromptId: id, onSuccess,
    initialTitle: '測試範本', initialDescription: '門診摘要用', initialPrompt: '請摘要病人資料',
    initialExampleOutput: '測試範例', initialIsPublic: false,
  }
  const view = render(<SharePromptDialog {...props} />)
  fireEvent.change(screen.getByDisplayValue('門診摘要用'), { target: { value: emptyValue } })
  fireEvent.click(screen.getByRole('button', { name: '儲存變更' }))
  await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
  const saved = await getSharedPrompt(id)
  expect(saved).toMatchObject({ title: '測試範本', prompt: '請摘要病人資料', isPublic: false, exampleOutput: '測試範例' })
  expect(saved?.description).toBeUndefined()
  expect(memory.records.get('sharedPrompts/' + id)).not.toHaveProperty('description')
  view.unmount()
  render(<SharePromptDialog {...props} initialDescription={saved?.description} />)
  expect(screen.queryByDisplayValue('門診摘要用')).not.toBeInTheDocument()
})
