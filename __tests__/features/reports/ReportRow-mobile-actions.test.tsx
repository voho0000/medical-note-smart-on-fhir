import { render, screen } from '@testing-library/react'
import { ReportRow } from '@/features/clinical-summary/reports/components/ReportRow'
import type { Row } from '@/features/clinical-summary/reports/types'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { AudienceProvider } from '@/src/application/providers/audience.provider'
import { RightDetailProvider } from '@/src/application/providers/right-detail.provider'

jest.mock('@/features/report-interpretation', () => ({
  ReportInterpretationButton: jest.requireActual(
    '@/features/report-interpretation/ReportInterpretationButton',
  ).ReportInterpretationButton,
  ReportInterpretationPanel: () => null,
}))

describe('ReportRow mobile actions', () => {
  it('wraps narrative report actions without shrinking the AI button', () => {
    const row: Row = {
      id: 'report-1',
      title: '胸部電腦斷層檢查報告',
      meta: 'Radiology • final',
      group: 'imaging',
      institution: '臺北榮民總醫院',
      effectiveDate: '2026-07-15',
      obs: [{
        id: 'obs-1',
        code: { text: 'Report Summary' },
        valueString: 'No focal consolidation. No pleural effusion. The cardiac silhouette is within normal limits.',
      }],
    }

    render(
      <LanguageProvider>
        <AudienceProvider>
          <RightDetailProvider>
            <ReportRow row={row} defaultOpen={[]} />
          </RightDetailProvider>
        </AudienceProvider>
      </LanguageProvider>,
    )

    const aiButton = screen.getByRole('button', { name: 'AI 翻譯解讀' })
    expect(aiButton).toHaveClass('shrink-0', 'whitespace-nowrap')

    const header = aiButton.closest('[role="button"][aria-expanded]')
    expect(header).toHaveClass('flex-col', 'sm:flex-row')
    expect(header?.parentElement).toHaveClass('w-full', 'min-w-0', 'max-w-full', 'overflow-hidden')
    expect(aiButton.parentElement).toHaveClass('flex-wrap', 'justify-start', 'sm:flex-nowrap', 'sm:justify-end')
  })
})
