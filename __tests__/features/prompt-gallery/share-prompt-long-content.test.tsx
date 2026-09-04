import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { addDoc, collection } from 'firebase/firestore'
import { SharePromptDialog } from '@/features/prompt-gallery/components/SharePromptDialog'
import { LONG_PROMPT_CASES, makeLongPrompt } from './fixtures/long-prompts'

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({ t: jest.requireActual('@/src/shared/i18n/locales/zh-TW').zhTW }),
}))
jest.mock('@/src/application/providers/auth.provider', () => ({
  useAuth: () => ({ user: { uid: 'long-prompt-author', displayName: 'Test author' } }),
}))
jest.mock('@/src/application/providers/audience.provider', () => ({
  useAudience: () => ({ audience: 'medical' }),
}))
jest.mock('@/src/shared/config/firebase.config', () => ({ db: {} }))
// Exercise the real share service up to the database boundary; never publish.
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({ path: 'sharedPrompts' })),
  addDoc: jest.fn(),
  Timestamp: { now: jest.fn(() => ({ seconds: 0, nanoseconds: 0 })) },
}))

beforeEach(() => {
  jest.mocked(addDoc).mockResolvedValue({ id: 'long-prompt-template' } as Awaited<ReturnType<typeof addDoc>>)
})

describe.each(LONG_PROMPT_CASES)('sharing a prompt with $name', ({ length, singleLine, format }) => {
  it('loads, edits, reopens and writes the entire prompt without a length cap', async () => {
    const source = makeLongPrompt(length, singleLine)
    expect(source).toHaveLength(length)
    render(<SharePromptDialog open onOpenChange={jest.fn()} initialTitle="長文測試"
      initialPrompt={source} initialType="summary" initialOutputFormat={format}
      initialLanguagePolicy="follow-template" />)

    const compact = screen.getByRole('textbox', { name: 'Prompt 內容 *' })
    expect(compact).toHaveValue(source)
    expect(compact).not.toHaveAttribute('maxlength')
    expect(screen.getByText(`${length} 字元`, { exact: true })).toBeInTheDocument()
    const compactEdit = source + '\nCompact edit：保留最後一段。'
    fireEvent.change(compact, { target: { value: compactEdit } })

    fireEvent.click(screen.getByRole('button', { name: '展開編輯' }))
    const editor = await screen.findByRole('dialog', { name: '編輯 Prompt' })
    const expanded = within(editor).getByRole('textbox', { name: 'Prompt 內容' })
    expect(expanded).toHaveValue(compactEdit)
    expect(expanded).not.toHaveAttribute('maxlength')
    const expandedEdit = compactEdit.replace('PROMPT_START', 'EDITED_START') + '\nExpanded edit：最後確認 ✅'
    fireEvent.change(expanded, { target: { value: expandedEdit } })
    fireEvent.keyDown(expanded, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '編輯 Prompt' })).not.toBeInTheDocument())
    expect(screen.getByRole('textbox', { name: 'Prompt 內容 *' })).toHaveValue(expandedEdit)
    expect(screen.getByRole('button', { name: '展開編輯' })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: '展開編輯' }))
    const reopened = await screen.findByRole('dialog', { name: '編輯 Prompt' })
    expect(within(reopened).getByRole('textbox')).toHaveValue(expandedEdit)
    fireEvent.click(within(reopened).getByRole('button', { name: '返回分享表單' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '編輯 Prompt' })).not.toBeInTheDocument())
    expect(screen.getByText(`${expandedEdit.length} 字元`, { exact: true })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '分享範本' }))
    await waitFor(() => expect(addDoc).toHaveBeenCalledTimes(1))
    expect(collection).toHaveBeenCalledWith(expect.anything(), 'sharedPrompts')
    expect(addDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      prompt: expandedEdit,
      outputFormat: format,
      languagePolicy: 'follow-template',
      title: '長文測試',
    }))
  })
})

it('accepts a long paste into an empty prompt, then disables sharing when all content is removed', async () => {
  render(<SharePromptDialog open onOpenChange={jest.fn()} initialTitle="貼上長文" />)
  expect(screen.getByRole('button', { name: '分享範本' })).toBeDisabled()
  const pasted = makeLongPrompt(100000)
  fireEvent.change(screen.getByRole('textbox', { name: 'Prompt 內容 *' }), { target: { value: pasted } })
  expect(screen.getByRole('button', { name: '分享範本' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: '展開編輯' }))
  const editor = await screen.findByRole('dialog', { name: '編輯 Prompt' })
  expect(within(editor).getByRole('textbox')).toHaveValue(pasted)
  fireEvent.change(within(editor).getByRole('textbox'), { target: { value: '' } })
  fireEvent.click(within(editor).getByRole('button', { name: '返回分享表單' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '編輯 Prompt' })).not.toBeInTheDocument())
  expect(screen.getByRole('textbox', { name: 'Prompt 內容 *' })).toHaveValue('')
  expect(screen.getByRole('button', { name: '分享範本' })).toBeDisabled()
  expect(addDoc).not.toHaveBeenCalled()
})
