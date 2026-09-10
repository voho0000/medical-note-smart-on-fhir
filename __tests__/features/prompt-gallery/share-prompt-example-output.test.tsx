import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SharePromptDialog } from '@/features/prompt-gallery/components/SharePromptDialog'
import { createSharedPrompt } from '@/features/prompt-gallery/services/prompt-gallery.service'
import { useDemoExampleOutput } from '@/features/prompt-gallery/hooks/useDemoExampleOutput'

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
jest.mock('@/features/prompt-gallery/hooks/useDemoExampleOutput', () => ({
  useDemoExampleOutput: jest.fn(),
}))
jest.mock('@/features/prompt-gallery/services/prompt-gallery.service', () => ({
  createSharedPrompt: jest.fn(),
  updateSharedPrompt: jest.fn(),
  EXAMPLE_OUTPUT_MAX_LENGTH: 20000,
}))
jest.mock('@/features/prompt-gallery/services/tenant-prompts.service', () => ({
  createTenantPrompt: jest.fn(),
}))

const generateExample = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(useDemoExampleOutput).mockReturnValue(generateExample)
  generateExample.mockResolvedValue('試用病人的自動範例')
  jest.mocked(createSharedPrompt).mockResolvedValue('created')
})

it('explains the blank-field behavior and saves the generated trial-patient example', async () => {
  render(<SharePromptDialog open onOpenChange={jest.fn()} initialTitle="測試範本" initialPrompt="請摘要病人資料" />)

  const formatPicker = screen.getByRole('combobox', { name: '顯示格式' })
  const exampleField = screen.getByRole('textbox', { name: '輸出範例' })
  const privacyReminder = screen.getByRole('alert')
  expect(formatPicker.compareDocumentPosition(exampleField) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(exampleField.compareDocumentPosition(privacyReminder) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getByPlaceholderText('未填寫時會以試用病人自動產生；也可自行貼上去識別化的示範輸出')).toBeInTheDocument()
  expect(screen.getByText('未填寫時，系統會使用試用病人自動產生輸出範例。請勿貼上真實病人資料。')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '分享範本' }))

  await waitFor(() => expect(generateExample).toHaveBeenCalledWith({
    prompt: '請摘要病人資料',
    outputFormat: 'markdown',
    languagePolicy: undefined,
  }))
  await waitFor(() => expect(createSharedPrompt).toHaveBeenCalledWith(expect.objectContaining({
    exampleOutput: '試用病人的自動範例',
  })))
})

it('preserves a manually entered example without generating another one', async () => {
  render(<SharePromptDialog open onOpenChange={jest.fn()} initialTitle="測試範本"
    initialPrompt="請摘要病人資料" initialExampleOutput="作者提供的範例" />)

  fireEvent.click(screen.getByRole('button', { name: '分享範本' }))

  await waitFor(() => expect(createSharedPrompt).toHaveBeenCalledWith(expect.objectContaining({
    exampleOutput: '作者提供的範例',
  })))
  expect(generateExample).not.toHaveBeenCalled()
})

it('keeps the form open with a clear retry message when automatic generation fails', async () => {
  generateExample.mockRejectedValueOnce(new Error('provider details'))
  render(<SharePromptDialog open onOpenChange={jest.fn()} initialTitle="測試範本" initialPrompt="請摘要病人資料" />)

  fireEvent.click(screen.getByRole('button', { name: '分享範本' }))

  expect(await screen.findByText('無法使用試用病人產生輸出範例，請重試或自行填寫。')).toBeInTheDocument()
  expect(screen.queryByText('provider details')).not.toBeInTheDocument()
  expect(createSharedPrompt).not.toHaveBeenCalled()
})

it('keeps the generated example in the form when saving fails so retry does not regenerate it', async () => {
  jest.mocked(createSharedPrompt).mockRejectedValueOnce(new Error('save failed')).mockResolvedValueOnce('created')
  render(<SharePromptDialog open onOpenChange={jest.fn()} initialTitle="測試範本" initialPrompt="請摘要病人資料" />)

  fireEvent.click(screen.getByRole('button', { name: '分享範本' }))
  expect(await screen.findByText('save failed')).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: '輸出範例' })).toHaveValue('試用病人的自動範例')

  fireEvent.click(screen.getByRole('button', { name: '分享範本' }))
  await waitFor(() => expect(createSharedPrompt).toHaveBeenCalledTimes(2))
  expect(generateExample).toHaveBeenCalledTimes(1)
})
