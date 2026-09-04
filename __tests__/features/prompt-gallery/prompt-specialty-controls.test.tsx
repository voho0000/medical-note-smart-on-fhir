import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { PromptFilters } from '@/features/prompt-gallery/components/PromptFilters'
import { SharePromptDialog } from '@/features/prompt-gallery/components/SharePromptDialog'
import { PromptPreviewDialog } from '@/features/prompt-gallery/components/PromptPreviewDialog'
import { createSharedPrompt } from '@/features/prompt-gallery/services/prompt-gallery.service'
import { useAudience } from '@/src/application/providers/audience.provider'
import type { InsightOutputFormat } from '@/src/shared/constants/clinical-insights.constants'
import type { PromptSpecialty, SharedPrompt } from '@/features/prompt-gallery/types/prompt.types'

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({ t: jest.requireActual('@/src/shared/i18n/locales/zh-TW').zhTW }),
}))
jest.mock('@/src/application/providers/auth.provider', () => ({
  useAuth: () => ({ user: { uid: 'test-author', displayName: 'Test author' } }),
}))
jest.mock('@/src/application/providers/audience.provider', () => ({ useAudience: jest.fn() }))
jest.mock('@/features/prompt-gallery/services/prompt-gallery.service', () => ({ createSharedPrompt: jest.fn() }))
jest.mock('@/features/prompt-gallery/components/LoginRequiredDialog', () => ({ LoginRequiredDialog: () => null }))

beforeEach(() => {
  jest.mocked(useAudience).mockReturnValue({ audience: 'medical' } as ReturnType<typeof useAudience>)
  Element.prototype.scrollIntoView = jest.fn()
  Element.prototype.hasPointerCapture = jest.fn(() => false)
  Element.prototype.releasePointerCapture = jest.fn()
})

function renderFilters(onSpecialtyChange = jest.fn()) {
  function Filters() {
    const [specialty, setSpecialty] = useState<PromptSpecialty>()
    return <PromptFilters searchQuery="" onSearchChange={jest.fn()} onTypeChange={jest.fn()}
      onCategoryChange={jest.fn()} selectedSpecialty={specialty}
      onSpecialtyChange={(value) => { setSpecialty(value); onSpecialtyChange(value) }} />
  }
  render(<Filters />)
}

it('starts with five groups, drills into one group, and can clear the selected specialty', async () => {
  const onChange = jest.fn()
  renderFilters(onChange)
  fireEvent.keyDown(screen.getByRole('button', { name: '依科別篩選' }), { key: 'ArrowDown' })
  expect(await screen.findAllByRole('menuitem')).toHaveLength(5)
  expect(screen.queryByRole('menuitemradio', { name: '腎臟內科' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('menuitem', { name: '內科與次專科' }))
  expect(screen.getAllByRole('menuitemradio')).toHaveLength(11)
  expect(screen.getByRole('menuitemradio', { name: '內科（含次專科）' })).toBeInTheDocument()
  expect(screen.queryByRole('menuitemradio', { name: '神經外科' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('menuitemradio', { name: '腎臟內科' }))
  expect(onChange).toHaveBeenCalledWith('nephrology')
  expect(screen.getByRole('button', { name: '依科別篩選' })).toHaveTextContent('腎臟內科')
  expect(screen.getByRole('button', { name: '依科別篩選' })).toHaveAccessibleDescription('腎臟內科')
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  fireEvent.keyDown(screen.getByRole('button', { name: '依科別篩選' }), { key: 'ArrowDown' })
  expect(await screen.findByRole('menuitem', { name: '內科與次專科 已選 1' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('menuitemradio', { name: '所有科別' }))
  expect(onChange).toHaveBeenLastCalledWith(undefined)
  expect(screen.getByRole('button', { name: '依科別篩選' })).toHaveTextContent('所有科別')
})

it('supports keyboard navigation into and out of each specialty group', async () => {
  renderFilters()
  const trigger = screen.getByRole('button', { name: '依科別篩選' })
  fireEvent.keyDown(trigger, { key: 'ArrowDown' })
  await screen.findByRole('menu')
  for (const [group, specialty, count] of [
    ['一般與其他', '職業醫學科', 4],
    ['內科與次專科', '感染科', 11],
    ['外科系', '神經外科', 6],
    ['其他臨床專科', '重症醫學科', 10],
    ['影像、病理與檢驗', '病理科（含解剖與臨床病理）', 6],
  ] as const) {
    fireEvent.keyDown(screen.getByRole('menuitem', { name: group }), { key: 'ArrowRight' })
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(count)
    expect(screen.getByRole('menuitemradio', { name: specialty })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '返回群組' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowLeft' })
    expect(screen.getByRole('menuitem', { name: group })).toHaveFocus()
  }
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  await waitFor(() => expect(trigger).toHaveFocus())
})

it('keeps specialty and medical-category filters out of the patient gallery', () => {
  jest.mocked(useAudience).mockReturnValue({ audience: 'patient' } as ReturnType<typeof useAudience>)
  renderFilters()
  expect(screen.queryByRole('button', { name: '依科別篩選' })).not.toBeInTheDocument()
  expect(screen.queryByRole('combobox', { name: '依分類篩選' })).not.toBeInTheDocument()
})

it('preserves multi-select choices across groups and reopening, and publishes those exact tags', async () => {
  jest.mocked(createSharedPrompt).mockResolvedValue('test-template')
  render(<SharePromptDialog open onOpenChange={jest.fn()} initialTitle="測試範本" initialPrompt="Summarize the available data." />)
  fireEvent.keyDown(screen.getByRole('button', { name: '科別 (可多選) *' }), { key: 'ArrowDown' })
  expect(await screen.findAllByRole('menuitem')).toHaveLength(5)
  expect(screen.queryByRole('menuitemcheckbox')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('menuitem', { name: '一般與其他 已選 1' }))
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '一般科' }))
  fireEvent.click(screen.getByRole('menuitem', { name: '返回群組' }))
  fireEvent.click(screen.getByRole('menuitem', { name: '內科與次專科' }))
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '腎臟內科' }))
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '心臟內科' }))
  expect(screen.getByRole('menuitemcheckbox', { name: '腎臟內科' })).toHaveAttribute('aria-checked', 'true')
  fireEvent.click(screen.getByRole('menuitem', { name: '返回群組' }))
  expect(screen.getByRole('menuitem', { name: '內科與次專科 已選 2' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('menuitem', { name: '外科系' }))
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '神經外科' }))
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  fireEvent.keyDown(screen.getByRole('button', { name: '科別 (可多選) *' }), { key: 'ArrowDown' })
  fireEvent.click(await screen.findByRole('menuitem', { name: '內科與次專科 已選 2' }))
  expect(screen.getByRole('menuitemcheckbox', { name: '腎臟內科' })).toHaveAttribute('aria-checked', 'true')
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  expect(document.getElementById('share-template-selected-specialties')).toHaveTextContent('腎臟內科 / 心臟內科 / 神經外科')
  fireEvent.click(screen.getByRole('button', { name: '分享範本' }))
  await waitFor(() => expect(createSharedPrompt).toHaveBeenCalledWith(expect.objectContaining({
    specialty: ['nephrology', 'cardiology', 'neurosurgery'],
  })))
})

it('keeps edits in sync between the compact and expanded editors and shares the final content', async () => {
  jest.mocked(createSharedPrompt).mockResolvedValue('test-template')
  render(<SharePromptDialog open onOpenChange={jest.fn()} initialTitle="編輯測試"
    initialPrompt="Original prompt." initialOutputFormat="html" />)
  fireEvent.change(screen.getByRole('textbox', { name: 'Prompt 內容 *' }), {
    target: { value: '## Compact edit\nKeep source dates.' },
  })
  fireEvent.click(screen.getByRole('button', { name: '展開編輯' }))
  const editor = await screen.findByRole('dialog', { name: '編輯 Prompt' })
  const expandedInput = within(editor).getByRole('textbox', { name: 'Prompt 內容' })
  expect(expandedInput).toHaveValue('## Compact edit\nKeep source dates.')
  const finalPrompt = '## Expanded edit\n<section>Preserve the original wording.</section>'
  fireEvent.change(expandedInput, { target: { value: finalPrompt } })
  fireEvent.click(within(editor).getByRole('button', { name: '返回分享表單' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '編輯 Prompt' })).not.toBeInTheDocument())
  expect(screen.getByRole('button', { name: '展開編輯' })).toHaveFocus()
  expect(screen.getByRole('textbox', { name: 'Prompt 內容 *' })).toHaveValue(finalPrompt)
  expect(screen.getByRole('textbox', { name: '標題 *' })).toHaveValue('編輯測試')
  fireEvent.click(screen.getByRole('button', { name: '分享範本' }))
  await waitFor(() => expect(createSharedPrompt).toHaveBeenCalledWith(expect.objectContaining({
    prompt: finalPrompt, outputFormat: 'html', title: '編輯測試',
  })))
})

it('Escape returns from the editor without closing the share form or losing edits', async () => {
  const onOpenChange = jest.fn()
  const { rerender } = render(<SharePromptDialog open onOpenChange={onOpenChange} initialPrompt="Original prompt." />)
  fireEvent.click(screen.getByRole('button', { name: '展開編輯' }))
  const editor = await screen.findByRole('dialog', { name: '編輯 Prompt' })
  fireEvent.change(within(editor).getByRole('textbox'), { target: { value: 'Keep this edit.' } })
  fireEvent.keyDown(editor, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '編輯 Prompt' })).not.toBeInTheDocument())
  expect(onOpenChange).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog', { name: '分享範本' })).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Prompt 內容 *' })).toHaveValue('Keep this edit.')

  fireEvent.click(screen.getByRole('button', { name: '展開編輯' }))
  rerender(<SharePromptDialog open={false} onOpenChange={onOpenChange} />)
  rerender(<SharePromptDialog open onOpenChange={onOpenChange} initialPrompt="Next template." />)
  expect(screen.queryByRole('dialog', { name: '編輯 Prompt' })).not.toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Prompt 內容 *' })).toHaveValue('Next template.')
})

it.each([
  ['plain-text', '純文字'],
  ['markdown', 'Markdown'],
  ['html', 'HTML'],
] as const)('shares the chosen %s format while preserving the prompt and language policy', async (format, label) => {
  jest.mocked(createSharedPrompt).mockResolvedValue('test-template')
  render(<SharePromptDialog open onOpenChange={jest.fn()} initialType="summary"
    initialTitle="格式測試" initialPrompt="Summarize the available data."
    initialOutputFormat="html" initialLanguagePolicy="follow-template" />)
  const picker = screen.getByRole('combobox', { name: '顯示格式' })
  expect(picker).toHaveTextContent('HTML')
  fireEvent.keyDown(picker, { key: 'ArrowDown' })
  fireEvent.click(await screen.findByRole('option', { name: label }))
  expect(picker).toHaveTextContent(label)
  fireEvent.click(screen.getByRole('button', { name: '分享範本' }))
  await waitFor(() => expect(createSharedPrompt).toHaveBeenCalledWith(expect.objectContaining({
    outputFormat: format, languagePolicy: 'follow-template', prompt: 'Summarize the available data.',
  })))
})

it('defaults new templates to Markdown and reloads the source format each time sharing opens', async () => {
  const props = { onOpenChange: jest.fn(), initialTitle: '測試', initialPrompt: 'Summarize.' }
  const { rerender } = render(<SharePromptDialog open {...props} />)
  expect(screen.getByRole('combobox', { name: '顯示格式' })).toHaveTextContent('Markdown')
  fireEvent.keyDown(screen.getByRole('combobox', { name: '顯示格式' }), { key: 'ArrowDown' })
  fireEvent.click(await screen.findByRole('option', { name: 'HTML' }))
  rerender(<SharePromptDialog open={false} {...props} />)
  rerender(<SharePromptDialog open {...props} initialOutputFormat="plain-text" />)
  expect(screen.getByRole('combobox', { name: '顯示格式' })).toHaveTextContent('純文字')
})

it.each<[InsightOutputFormat | undefined, string]>([
  ['plain-text', '純文字'], ['markdown', 'Markdown'], ['html', 'HTML'], [undefined, 'Markdown'],
])('shows %s in the preview and passes the format unchanged when applying the template', (outputFormat, label) => {
  const prompt: SharedPrompt = {
    id: 'format-preview', title: '格式測試', prompt: 'Summarize.', types: ['summary'],
    category: 'summary', specialty: ['general'], audience: ['medical'], tags: [],
    createdAt: new Date('2026-09-03'), updatedAt: new Date('2026-09-03'), outputFormat,
  }
  const onUse = jest.fn()
  render(<PromptPreviewDialog open onOpenChange={jest.fn()} prompt={prompt} onUse={onUse} useMode="summary" />)
  expect(screen.getByRole('definition')).toHaveTextContent(label)
  fireEvent.click(screen.getByRole('button', { name: '加入自訂摘要' }))
  expect(onUse).toHaveBeenCalledWith(prompt, 'summary')
})
