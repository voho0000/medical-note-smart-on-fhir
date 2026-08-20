import { render, screen } from '@testing-library/react'
import { AnalyteTrendRow } from '@/features/clinical-summary/visit-history/components/AnalyteTrendRow'
import type { EncounterTestSeries } from '@/features/clinical-summary/visit-history/hooks/useEncounterDetails'
import type { EncounterObservation } from '@/features/clinical-summary/visit-history/components/EncounterObservationCard'

function value(id: string, v: string, day: string): EncounterObservation {
  return {
    id,
    title: 'WBC',
    value: v,
    effectiveDateTime: `2026-08-${day}T08:30:00+08:00`,
    source: 'observation',
    components: [],
  }
}

function series(count: number): EncounterTestSeries {
  return {
    id: 'wbc',
    title: 'WBC',
    sortKey: 'WBC',
    values: Array.from({ length: count }, (_, i) => value(`v${i}`, `${8 + i}.1 1000/uL`, String(11 + i))),
    abnormalCount: 0,
  }
}

describe('AnalyteTrendRow fold layout', () => {
  it('spends no extra line on the fold chevron', () => {
    // The chevron used to be promoted to the phone layout's full-width second
    // row, so a one-line series summary rendered as two lanes plus the row gap
    // for a single 12px glyph (mobile audit #21).
    render(<AnalyteTrendRow series={series(3)} />)

    const trailing = screen.getByTestId('compact-lab-meta')
    expect(trailing).toHaveClass('col-start-3', 'row-start-1')
    expect(trailing).not.toHaveClass('row-start-2')
  })

  it('is the tap target itself, at its natural height', () => {
    // The whole row folds (role=button), and a ~343px-wide row is an easy
    // target well under 36px tall — so it keeps no height floor. Reserving 36px
    // here bought nothing but padding around a single line of text.
    render(<AnalyteTrendRow series={series(3)} />)

    const row = screen.getByTestId('compact-lab-result-row')
    expect(row).toHaveAttribute('role', 'button')
    expect(row.className).not.toMatch(/min-h-/)
  })

  it('leaves a single-value row unfoldable, and unfloored', () => {
    // Nothing to expand → no role=button → no tap target to reserve height
    // for, so the row collapses to its natural single line.
    render(<AnalyteTrendRow series={series(1)} />)

    const row = screen.getByTestId('compact-lab-result-row')
    expect(row).not.toHaveAttribute('role')
    expect(screen.queryByTestId('compact-lab-meta')).toBeNull()
  })
})
