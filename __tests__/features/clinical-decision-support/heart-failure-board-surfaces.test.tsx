/**
 * The three surfaces DP-01 added to the board: the non-blocking banner, the
 * compensation judgement, and the care timeline. Each is checked for the
 * promise it makes — the banner never blocks and holds its actions behind the
 * second layer, the judgement writes to the one clinic record, and the timeline
 * stays closed until asked.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { HeartFailureStatusBoard } from '@/features/clinical-decision-support/renderers/HeartFailureStatusBoard'
import type { HeartFailureBoardModel } from '@/features/clinical-decision-support/renderers/heart-failure-board'
import type { CdssRecommendation, CdssStatus } from '@/features/clinical-decision-support/types'

const NOW = new Date('2026-09-05T09:00:00+08:00')

function recommendation(
  id: string,
  input: Partial<CdssRecommendation> = {},
): CdssRecommendation {
  return {
    id,
    moduleName: `模組 ${id}`,
    moduleGroup: 'treatment',
    domain: 'medication',
    priority: 'medium',
    status: 'review',
    title: `判斷 ${id}`,
    recommendation: `建議 ${id}`,
    rationale: `理由 ${id}`,
    patientEvidence: [],
    nextActions: [`下一步 ${id}`],
    guidelineReferences: [],
    safetyBoundary: `邊界 ${id}`,
    ...input,
  }
}

const emptyCounts: Record<CdssStatus, number> = {
  actionable: 0, 'needs-data': 0, review: 0, 'no-action': 0,
}

function board(input: Partial<HeartFailureBoardModel> = {}): HeartFailureBoardModel {
  return {
    headlines: [],
    evaluatedCount: 0,
    statusCounts: emptyCounts,
    metrics: [],
    alerts: [],
    pillarScope: 'none',
    pillars: [],
    consumedIds: new Set<string>(),
    ...input,
  }
}

function renderBoard(
  model: HeartFailureBoardModel,
  props: Partial<React.ComponentProps<typeof HeartFailureStatusBoard>> = {},
) {
  const onToggle = jest.fn()
  const onSaveClinicVitals = jest.fn()
  const result = render(
    <HeartFailureStatusBoard
      board={model}
      isEnglish={false}
      now={NOW}
      expandedId={null}
      onToggle={onToggle}
      renderDetail={() => <div />}
      onSaveClinicVitals={onSaveClinicVitals}
      {...props}
    />,
  )
  return { ...result, onToggle, onSaveClinicVitals }
}

describe('the non-blocking banner', () => {
  const alert = recommendation('renal-safety', {
    domain: 'safety',
    status: 'actionable',
    priority: 'high',
    title: 'eGFR 下降超過 30%',
    nextActions: ['重驗腎功能與電解質'],
  })

  it('says what needs the clinician without opening anything', () => {
    renderBoard(board({
      alerts: [alert],
      headlines: [{
        recommendation: recommendation('hf-gdmt', { status: 'actionable' }),
        action: '加上 SGLT2i',
        reason: '四支柱缺一',
        moduleName: 'FMT',
      }],
    }))

    expect(screen.getByTestId('cdss-hf-banner-summary')).toHaveTextContent('2 件事需要您')
    expect(screen.getByTestId('cdss-hf-banner-summary')).toHaveTextContent('其中 1 件是安全警訊')
    // The first layer carries the message and no action at all.
    expect(screen.queryByTestId('cdss-hf-banner-detail')).not.toBeInTheDocument()
    // It is announced politely; nothing here takes focus or covers the page.
    expect(screen.getByTestId('cdss-hf-banner-summary')).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('gives the detail and the action only on the second layer', () => {
    const { onToggle } = renderBoard(board({ alerts: [alert] }))

    fireEvent.click(screen.getByTestId('cdss-hf-banner-trigger'))
    const detail = screen.getByTestId('cdss-hf-banner-detail')
    expect(within(detail).getByText('eGFR 下降超過 30%')).toBeInTheDocument()
    expect(within(detail).getByText('重驗腎功能與電解質')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('cdss-hf-banner-open-renal-safety'))
    expect(onToggle).toHaveBeenCalledWith('renal-safety')
  })

  it('opens a module rather than toggling the one already open', () => {
    const { onToggle } = renderBoard(
      board({ alerts: [alert] }),
      { expandedId: 'renal-safety' },
    )
    fireEvent.click(screen.getByTestId('cdss-hf-banner-trigger'))
    fireEvent.click(screen.getByTestId('cdss-hf-banner-open-renal-safety'))
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('counts a safety module once even when it is also today\'s headline', () => {
    renderBoard(board({
      alerts: [alert],
      headlines: [{ recommendation: alert, action: '重驗腎功能與電解質', reason: 'eGFR 下降超過 30%', moduleName: 'Renal' }],
    }))
    expect(screen.getByTestId('cdss-hf-banner-summary')).toHaveTextContent('1 件事需要您')
  })

  it('stays quiet, and offers nothing to expand, when the visit needs nothing', () => {
    renderBoard(board())
    const banner = screen.getByTestId('cdss-hf-banner')
    expect(banner).toHaveAttribute('data-quiet', 'true')
    expect(screen.getByTestId('cdss-hf-banner-summary')).toHaveTextContent('本次沒有需要決定的事項')
    expect(screen.queryByTestId('cdss-hf-banner-trigger')).not.toBeInTheDocument()
  })
})

describe('the compensation judgement', () => {
  it('is unanswered by default and says a recorded admission is not today\'s state', () => {
    renderBoard(board())
    const section = screen.getByTestId('cdss-hf-compensation')
    expect(within(section).getByTestId('cdss-hf-compensation-compensated')).toHaveAttribute('aria-pressed', 'false')
    expect(within(section).getByTestId('cdss-hf-compensation-decompensated')).toHaveAttribute('aria-pressed', 'false')
    expect(section).toHaveTextContent('預設未回答')
  })

  it('writes into the same clinic record as the congestion signs, keeping what is there', () => {
    const { onSaveClinicVitals } = renderBoard(board(), {
      clinicVitals: {
        measuredOn: '2026-09-05',
        heartRate: 72,
        signAnswers: { 'pitting-edema': 'present' },
      },
    })

    fireEvent.click(screen.getByTestId('cdss-hf-compensation-decompensated'))
    expect(onSaveClinicVitals).toHaveBeenCalledWith({
      measuredOn: '2026-09-05',
      heartRate: 72,
      signAnswers: { 'pitting-edema': 'present' },
      compensationStatus: 'decompensated',
    })
  })

  it('returns to unanswered when the selected state is tapped again', () => {
    const { onSaveClinicVitals } = renderBoard(board(), {
      clinicVitals: { measuredOn: '2026-09-05', compensationStatus: 'compensated' },
    })

    expect(screen.getByTestId('cdss-hf-compensation-compensated')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByTestId('cdss-hf-compensation-compensated'))
    expect(onSaveClinicVitals).toHaveBeenCalledWith(
      expect.objectContaining({ compensationStatus: undefined }),
    )
  })

  it('is absent where there is no patient to attach a measurement to', () => {
    renderBoard(board(), { onSaveClinicVitals: undefined })
    expect(screen.queryByTestId('cdss-hf-compensation')).not.toBeInTheDocument()
  })
})

describe('the care timeline', () => {
  const timeline = {
    from: '2024-03-02',
    to: '2026-08-20',
    entries: [
      { id: 'lvef-2024-03-02', kind: 'lvef' as const, date: '2024-03-02', label: 'LVEF', detail: '38%', value: 38 },
      { id: 'medication-sglt2Therapy', kind: 'medication' as const, date: '2024-04-01', endDate: '2026-08-20', label: 'SGLT2i', ongoing: true },
    ],
  }

  it('opens closed, showing the span and the count on one line', () => {
    renderBoard(board({ timeline }))
    const trigger = screen.getByTestId('cdss-hf-timeline-trigger')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveTextContent('2024-03-02 → 2026-08-20')
    expect(trigger).toHaveTextContent('1 筆 LVEF')
    expect(screen.queryByTestId('cdss-hf-timeline-detail')).not.toBeInTheDocument()
  })

  it('shows the dated rail when opened, and says a prescription span is not administration', () => {
    renderBoard(board({ timeline }))
    fireEvent.click(screen.getByTestId('cdss-hf-timeline-trigger'))

    const detail = screen.getByTestId('cdss-hf-timeline-detail')
    expect(within(detail).getByTestId('cdss-hf-timeline-entry-lvef-2024-03-02')).toHaveTextContent('38%')
    const span = within(detail).getByTestId('cdss-hf-timeline-entry-medication-sglt2Therapy')
    expect(span).toHaveTextContent('2024-04-01 → 2026-08-20')
    expect(span).toHaveTextContent('使用中')
    expect(detail).toHaveTextContent('處方區間是領藥紀錄，不等於實際服用期間')
  })

  it('is absent when the record dated too little to draw a line', () => {
    renderBoard(board())
    expect(screen.queryByTestId('cdss-hf-timeline')).not.toBeInTheDocument()
  })
})
