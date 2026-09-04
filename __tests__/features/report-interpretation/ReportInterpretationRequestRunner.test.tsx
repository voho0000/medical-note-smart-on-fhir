import { render, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import {
  useReportInterpretation,
  type UseReportInterpretationReturn,
} from '@/src/application/hooks/report-interpretation/use-report-interpretation.hook'
import { ReportInterpretationRequestRunner } from '@/features/report-interpretation/ReportInterpretationRequestRunner'

jest.mock('@/src/application/hooks/report-interpretation/use-report-interpretation.hook', () => ({
  useReportInterpretation: jest.fn(),
}))
jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({ locale: 'zh-TW' }),
}))
jest.mock('sonner', () => ({
  toast: { error: jest.fn() },
}))

const mockedUseReportInterpretation = jest.mocked(useReportInterpretation)
const mockedToastError = jest.mocked(toast.error)
const generate = jest.fn(async () => {})
const regenerate = jest.fn(async () => {})
const result = {
  translation: '中文翻譯',
  summary: '報告摘要',
  findings: '主要發現',
  truncated: false,
}

function hookState(
  patch: Partial<UseReportInterpretationReturn> = {},
): UseReportInterpretationReturn {
  return {
    result: undefined,
    isGenerating: false,
    error: null,
    generationKey: 'report-key',
    hasText: true,
    isHydrated: true,
    generate,
    regenerate,
    ...patch,
  }
}

function runner(onReady: () => void, onFailed: () => void) {
  return (
    <ReportInterpretationRequestRunner
      reportId="report:1"
      reportText="Chest X-ray report"
      onReady={onReady}
      onFailed={onFailed}
    />
  )
}

describe('ReportInterpretationRequestRunner', () => {
  beforeEach(() => {
    generate.mockClear()
    regenerate.mockClear()
    mockedToastError.mockClear()
  })

  it('waits for a complete result before asking the host to open the right pane', async () => {
    let current = hookState()
    mockedUseReportInterpretation.mockImplementation(() => current)
    const onReady = jest.fn()
    const onFailed = jest.fn()
    const view = render(runner(onReady, onFailed))

    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1))
    expect(onReady).not.toHaveBeenCalled()

    current = hookState({ isGenerating: true })
    view.rerender(runner(onReady, onFailed))
    expect(onReady).not.toHaveBeenCalled()

    current = hookState({ result, isGenerating: false })
    view.rerender(runner(onReady, onFailed))

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1))
    expect(onFailed).not.toHaveBeenCalled()
  })

  it('opens immediately from cache without generating again', async () => {
    mockedUseReportInterpretation.mockReturnValue(hookState({ result }))
    const onReady = jest.fn()

    render(runner(onReady, jest.fn()))

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1))
    expect(generate).not.toHaveBeenCalled()
  })

  it('keeps the right pane untouched and reports a failed request', async () => {
    let current = hookState()
    mockedUseReportInterpretation.mockImplementation(() => current)
    const onReady = jest.fn()
    const onFailed = jest.fn()
    const view = render(runner(onReady, onFailed))

    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1))
    current = hookState({ error: '連線失敗' })
    view.rerender(runner(onReady, onFailed))

    await waitFor(() => expect(onFailed).toHaveBeenCalledTimes(1))
    expect(onReady).not.toHaveBeenCalled()
    expect(mockedToastError).toHaveBeenCalledWith('連線失敗')
  })
})
