import { fireEvent, render, screen } from '@testing-library/react'
import { CustomInsightModuleEditor } from '@/features/clinical-insights/components/CustomInsightModuleEditor'

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    t: jest.requireActual('@/src/shared/i18n/locales/zh-TW').zhTW,
  }),
}))

jest.mock('@/src/application/providers/auth.provider', () => ({
  useAuth: () => ({ user: { uid: 'test-user' } }),
}))

jest.mock('@/features/prompt-gallery/components/LoginRequiredDialog', () => ({
  LoginRequiredDialog: () => null,
}))

describe('CustomInsightModuleEditor long prompt ergonomics', () => {
  const longPrompt = Array.from({ length: 300 }, (_, index) => `Line ${index + 1}`).join('\n')

  const renderEditor = (prompt = longPrompt, isCustomModel = false) => {
    const onUpdate = jest.fn()
    render(
      <CustomInsightModuleEditor
        panel={{
          id: 'hmc',
          title: 'HMC 門診病歷',
          prompt,
          showInSummary: true,
          autoGenerate: false,
          outputFormat: 'plain-text',
          languagePolicy: 'follow-template',
        }}
        index={0}
        canRemove
        canMoveUp={false}
        canMoveDown={false}
        summaryModuleCount={1}
        autoModuleCount={0}
        maxSummaryModules={5}
        maxAutoModules={2}
        isCustomModel={isCustomModel}
        onUpdate={onUpdate}
        onRemove={jest.fn()}
        onMove={jest.fn()}
      />,
    )
    return onUpdate
  }

  it('keeps settings before a bounded prompt and offers a dedicated editor', () => {
    const onUpdate = renderEditor()
    const formatLabel = screen.getByText('輸出格式', { selector: 'label' })
    const promptLabel = screen.getByText('提示', { selector: 'label' })
    const inlinePrompt = screen.getByLabelText('提示')

    expect(formatLabel.compareDocumentPosition(promptLabel) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy()
    expect(inlinePrompt).toHaveClass('h-64', 'max-h-[40vh]', 'field-sizing-fixed', 'overflow-y-auto')

    fireEvent.click(screen.getByRole('button', { name: '展開編輯' }))

    const dialog = screen.getByRole('dialog', { name: '編輯 Prompt: HMC 門診病歷' })
    const expandedPrompt = screen.getByRole('textbox', { name: '編輯 Prompt: HMC 門診病歷' })
    expect(dialog).toBeInTheDocument()
    expect(expandedPrompt).toHaveValue(longPrompt)
    expect(screen.getByText(/純文字 · 依模板設定/)).toBeInTheDocument()

    fireEvent.change(expandedPrompt, { target: { value: 'Updated prompt' } })
    expect(onUpdate).toHaveBeenCalledWith('hmc', { prompt: 'Updated prompt' })

    fireEvent.click(screen.getByRole('button', { name: '返回模板' }))
    expect(screen.queryByRole('dialog', { name: '編輯 Prompt: HMC 門診病歷' }))
      .not.toBeInTheDocument()
  })

  it('warns at the review threshold for a custom model in both editors', () => {
    renderEditor('x'.repeat(2000), true)

    expect(screen.getByRole('status')).toHaveTextContent('2000 字元')
    expect(screen.getByRole('status')).toHaveTextContent('字數沒有可靠的安全界線')

    fireEvent.click(screen.getByRole('button', { name: '展開編輯' }))
    expect(screen.getByRole('dialog')).toContainElement(screen.getByRole('status'))
  })

  it('does not warn below the review threshold', () => {
    renderEditor('x'.repeat(1999), true)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('does not apply the Tvghbrain review cue to built-in models', () => {
    renderEditor('x'.repeat(2000))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
