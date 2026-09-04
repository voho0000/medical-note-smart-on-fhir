// `report_interpret` — the 「AI 翻譯解讀」 entry points. What matters here is
// that a CLOSE is not counted as a request, and that the automatic generation
// on mount is not counted a second time.
import { fireEvent, render, screen } from '@testing-library/react'

jest.mock('@/src/application/telemetry/usage-analytics', () => ({
  trackEvent: jest.fn(),
}))

jest.mock('@/src/application/hooks/report-interpretation/use-report-interpretation.hook', () => ({
  useReportInterpretation: jest.fn(),
}))

import { trackEvent } from '@/src/application/telemetry/usage-analytics'
import { useReportInterpretation } from '@/src/application/hooks/report-interpretation/use-report-interpretation.hook'
import { ReportInterpretationButton } from '@/features/report-interpretation/ReportInterpretationButton'
import { ReportInterpretationPanel } from '@/features/report-interpretation/ReportInterpretationPanel'
import { LanguageProvider } from '@/src/application/providers/language.provider'

const mockedTrackEvent = trackEvent as jest.MockedFunction<typeof trackEvent>
const mockedUseReportInterpretation = jest.mocked(useReportInterpretation)
const mockRegenerate = jest.fn(async () => {})
const mockGenerate = jest.fn(async () => {})

describe('report_interpret', () => {
  beforeEach(() => {
    localStorage.setItem('medical-note-locale', 'zh-TW')
    mockedTrackEvent.mockClear()
    mockRegenerate.mockClear()
    mockGenerate.mockClear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('the toggle button', () => {
    it('reports one open when the press reveals the panel', () => {
      render(
        <LanguageProvider>
          <ReportInterpretationButton active={false} onToggle={jest.fn()} analyticsHost="report-row" />
        </LanguageProvider>,
      )

      fireEvent.click(screen.getByRole('button'))

      expect(mockedTrackEvent).toHaveBeenCalledTimes(1)
      expect(mockedTrackEvent).toHaveBeenCalledWith('report_interpret', {
        host: 'report-row',
        action: 'open',
      })
    })

    it('reports nothing when the press collapses an open panel', () => {
      const onToggle = jest.fn()
      render(
        <LanguageProvider>
          <ReportInterpretationButton active onToggle={onToggle} analyticsHost="document-card" />
        </LanguageProvider>,
      )

      fireEvent.click(screen.getByRole('button'))

      expect(onToggle).toHaveBeenCalledTimes(1)
      expect(mockedTrackEvent).not.toHaveBeenCalled()
    })

    it('carries the host it was rendered on', () => {
      render(
        <LanguageProvider>
          <ReportInterpretationButton
            active={false}
            onToggle={jest.fn()}
            analyticsHost="document-dialog"
          />
        </LanguageProvider>,
      )

      fireEvent.click(screen.getByRole('button'))

      expect(mockedTrackEvent).toHaveBeenCalledWith('report_interpret', {
        host: 'document-dialog',
        action: 'open',
      })
    })

  })

  describe('the panel', () => {
    it('reports a regenerate press, and nothing for the automatic first run', () => {
      mockedUseReportInterpretation.mockReturnValue({
        result: {
          translation: '翻譯內容',
          summary: '這份報告在看什麼',
          findings: '主要發現',
          truncated: false,
        },
        isGenerating: false,
        error: null,
        generationKey: 'report-1-key',
        hasText: true,
        isHydrated: true,
        generate: mockGenerate,
        regenerate: mockRegenerate,
      })

      render(
        <LanguageProvider>
          <ReportInterpretationPanel
            reportId="report:1"
            reportText="CT of the chest"
            analyticsHost="report-row"
          />
        </LanguageProvider>,
      )

      // Mounting auto-generates; the button that mounted this already counted.
      expect(mockedTrackEvent).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole('button', { name: '重新產生' }))

      expect(mockRegenerate).toHaveBeenCalledTimes(1)
      expect(mockedTrackEvent).toHaveBeenCalledTimes(1)
      expect(mockedTrackEvent).toHaveBeenCalledWith('report_interpret', {
        host: 'report-row',
        action: 'regenerate',
      })
    })

    it('reports the manual-mode trigger as an open', () => {
      mockedUseReportInterpretation.mockReturnValue({
        result: undefined,
        isGenerating: false,
        error: null,
        generationKey: 'report-2-key',
        hasText: true,
        isHydrated: true,
        generate: mockGenerate,
        regenerate: mockRegenerate,
      })

      render(
        <LanguageProvider>
          <ReportInterpretationPanel
            reportId="report:2"
            reportText="CT of the chest"
            autoGenerate={false}
            analyticsHost="document-card"
          />
        </LanguageProvider>,
      )

      fireEvent.click(screen.getByRole('button', { name: 'AI翻譯' }))

      expect(mockGenerate).toHaveBeenCalledTimes(1)
      expect(mockedTrackEvent).toHaveBeenCalledWith('report_interpret', {
        host: 'document-card',
        action: 'open',
      })
    })

    it('stays silent for a host that reports nothing (EMR hand-off)', () => {
      mockedUseReportInterpretation.mockReturnValue({
        result: undefined,
        isGenerating: false,
        error: null,
        generationKey: 'report-3-key',
        hasText: true,
        isHydrated: true,
        generate: mockGenerate,
        regenerate: mockRegenerate,
      })

      render(
        <LanguageProvider>
          <ReportInterpretationPanel reportId="report:3" reportText="CT" autoGenerate={false} />
        </LanguageProvider>,
      )

      fireEvent.click(screen.getByRole('button', { name: 'AI翻譯' }))

      expect(mockGenerate).toHaveBeenCalledTimes(1)
      expect(mockedTrackEvent).not.toHaveBeenCalled()
    })
  })
})
