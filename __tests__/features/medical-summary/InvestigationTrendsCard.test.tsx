import { fireEvent, render, screen } from '@testing-library/react'
import { InvestigationTrendsCard } from '@/features/medical-summary/components/InvestigationTrendsCard'
import type { MedicalSummaryResult } from '@/src/core/entities/medical-summary.entity'
import type { InvestigationCumulativeTarget } from '@/features/medical-summary/utils/investigation-cumulative-target'

const result: MedicalSummaryResult = {
  headline: '摘要',
  summary: [],
  investigations: [{
    label: '腎功能 (eGFR)',
    kind: 'lab',
    direction: 'stable',
    trend: '86.6 (2025-12-16) → 93.9 (2026-01-08) → 73.6 (2026-02-26) → 93.49 mL/min/1.73m² (2026-06-17)',
    interpretation: '近期腎功能數值維持在正常範圍。',
    sourceKeys: ['L1'],
  }],
  medicationEducation: [],
  medicationReview: { regimen: [], changes: [], reconciliation: [] },
  problems: [],
  decisions: [],
  timeline: [],
  sourceIndex: [{
    key: 'L1',
    num: 1,
    verified: true,
    resourceType: 'DiagnosticReport',
    resourceId: 'report-egfr',
  }],
  droppedTimelineCount: 0,
}

const target: InvestigationCumulativeTarget = {
  categoryId: 'chem',
  resourceType: 'DiagnosticReport',
  resourceId: 'report-egfr',
  display: '腎功能 (eGFR)',
}

function renderCard(
  onOpenCumulative = jest.fn(),
  openingCumulativeTarget: InvestigationCumulativeTarget | null = null,
) {
  render(
    <InvestigationTrendsCard
      result={result}
      title="關鍵檢驗與檢查趨勢"
      subtitle="最近結果"
      kindLabel={(kind) => kind}
      directionLabel={(direction) => direction}
      typeLabel={(type) => type ?? ''}
      unverifiedLabel="未驗證"
      showMoreLabel="再看 {count} 項"
      showLessLabel="收合內容"
      openCumulativeLabel="查看累積報告"
      openingCumulativeLabel="正在開啟…"
      cumulativeTargets={[target]}
      openingCumulativeTarget={openingCumulativeTarget}
      onOpenCumulative={onOpenCumulative}
    />,
  )
  return onOpenCumulative
}

describe('InvestigationTrendsCard', () => {
  it('shows only the latest three serial points, including for cached four-point trends', () => {
    renderCard()

    expect(screen.queryByText(/86\.6 \(2025-12-16\)/)).not.toBeInTheDocument()
    expect(screen.getByText(/93\.9 \(2026-01-08\).*73\.6 \(2026-02-26\).*93\.49/)).toBeInTheDocument()
  })

  it('opens the exact cumulative target exposed for the investigation', () => {
    const onOpenCumulative = renderCard()

    fireEvent.click(screen.getByRole('button', { name: '查看累積報告: 腎功能 (eGFR)' }))
    expect(onOpenCumulative).toHaveBeenCalledWith(target)
  })

  it('shows immediate progress and prevents duplicate clicks while navigating', () => {
    const onOpenCumulative = renderCard(jest.fn(), target)
    const button = screen.getByRole('button', { name: '正在開啟…: 腎功能 (eGFR)' })

    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveTextContent('正在開啟…')
    fireEvent.click(button)
    expect(onOpenCumulative).not.toHaveBeenCalled()
  })
})
