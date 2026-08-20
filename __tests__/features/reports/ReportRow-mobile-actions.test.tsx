import { fireEvent, render, screen } from '@testing-library/react'
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
    expect(aiButton.parentElement).toHaveClass('flex-nowrap', 'justify-end')
    expect(aiButton.parentElement).not.toHaveClass('flex-wrap')

    // The collapsed narrative is available after opening the card, but does
    // not consume a third line in the compact phone list.
    expect(screen.getByText(/No focal consolidation/)).toHaveClass('max-sm:hidden')

    const rightPaneButton = screen.getByRole('button', { name: '在右側面板展開全文' })
    expect(rightPaneButton).toHaveClass('md:inline-flex', 'border-border', 'bg-background')

    fireEvent.click(rightPaneButton)
    expect(rightPaneButton).toHaveClass('border-primary', 'bg-primary/10', 'text-primary')

    fireEvent.click(rightPaneButton)
    expect(rightPaneButton).toHaveClass('border-border', 'bg-background')
  })

  it('marks the 36px trend action so its compact row reserves touch height', () => {
    // The row's height floor is `has-[[data-touch-target]]`, so the marker on
    // the action is what keeps a 36px tap target from being clipped by the
    // row. Losing it would silently collapse reports rows back under the
    // target size, which no layout assertion elsewhere would catch.
    const row: Row = {
      id: 'report-2',
      title: 'Potassium',
      meta: 'Laboratory • final',
      group: 'lab',
      institution: '臺北榮民總醫院',
      effectiveDate: '2026-07-15',
      obs: [{
        id: 'obs-2',
        code: { text: 'Potassium' },
        valueQuantity: { value: 4.1, unit: 'mmol/L' },
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

    const compactRow = screen.getByTestId('compact-lab-result-row')
    const action = compactRow.querySelector('[data-touch-target]')
    expect(action).not.toBeNull()
    expect(action).toHaveAttribute('data-report-history-action')
    expect(action).toHaveClass('min-h-[36px]', 'min-w-[36px]', 'max-md:-my-[11px]')
  })
})
