import { act, render, screen } from '@testing-library/react'
import { ReportInterpretationPanel } from '@/features/report-interpretation/ReportInterpretationPanel'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { useReportInterpretation } from '@/src/application/hooks/report-interpretation/use-report-interpretation.hook'

jest.mock('@/src/application/hooks/report-interpretation/use-report-interpretation.hook', () => ({
  useReportInterpretation: jest.fn(),
}))

const mockedUseReportInterpretation = jest.mocked(useReportInterpretation)

describe('ReportInterpretationPanel loading state', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    localStorage.setItem('medical-note-locale', 'zh-TW')
    mockedUseReportInterpretation.mockReturnValue({
      result: undefined,
      isGenerating: true,
      error: null,
      generationKey: 'doc-1-key',
      hasText: true,
      isHydrated: true,
      generate: jest.fn(async () => {}),
      regenerate: jest.fn(async () => {}),
    })
  })

  afterEach(() => {
    jest.useRealTimers()
    localStorage.clear()
    jest.clearAllMocks()
  })

  it('shows elapsed time and explains when the request is taking unusually long', () => {
    render(
      <LanguageProvider>
        <ReportInterpretationPanel reportId="doc-1" reportText="Discharge summary" />
      </LanguageProvider>,
    )

    expect(screen.getByText('AI 翻譯與解讀中，通常一分鐘內完成。')).toBeInTheDocument()
    expect(screen.getByTestId('report-interpretation-elapsed')).toHaveTextContent('已等待 00:00')

    act(() => {
      jest.advanceTimersByTime(60_000)
    })

    expect(screen.getByText(/處理時間比平常久/)).toBeInTheDocument()
    expect(screen.getByTestId('report-interpretation-elapsed')).toHaveTextContent('已等待 01:00')
  })

  it('does not automatically retry the same failed input when the generate callback changes', () => {
    const generateCall = jest.fn()
    mockedUseReportInterpretation.mockImplementation((args) => ({
      result: undefined,
      isGenerating: false,
      error: '測試失敗',
      generationKey: args.reportText,
      hasText: true,
      isHydrated: true,
      // Deliberately return a new callback every render, matching the identity
      // churn that previously retriggered the panel effect after an error.
      generate: async () => { generateCall() },
      regenerate: jest.fn(async () => {}),
    }))

    const view = render(
      <LanguageProvider>
        <ReportInterpretationPanel reportId="doc-1" reportText="Discharge summary" />
      </LanguageProvider>,
    )

    expect(generateCall).toHaveBeenCalledTimes(1)
    expect(screen.getByText('測試失敗')).toBeInTheDocument()

    view.rerender(
      <LanguageProvider>
        <ReportInterpretationPanel reportId="doc-1" reportText="Discharge summary" />
      </LanguageProvider>,
    )

    expect(generateCall).toHaveBeenCalledTimes(1)

    view.rerender(
      <LanguageProvider>
        <ReportInterpretationPanel reportId="doc-1" reportText="Updated summary" />
      </LanguageProvider>,
    )

    expect(generateCall).toHaveBeenCalledTimes(2)
  })
})
