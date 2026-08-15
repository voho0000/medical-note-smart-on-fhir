import { fireEvent, render, screen } from '@testing-library/react'
import { CumulativeLabTrendDetail } from '@/features/clinical-summary/reports/components/CumulativeLabTrendDetail'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import type { LabTrendPoint, LabTrendSeries } from '@/src/shared/utils/lab-trend.utils'

function point(
  id: string,
  effectiveTime: string,
  value: number,
  unit: string,
): LabTrendPoint {
  return {
    id,
    effectiveTime,
    timestamp: Date.parse(effectiveTime),
    value,
    rawValue: value,
    unit,
    rawUnit: unit,
    status: 'final',
    abnormal: false,
    critical: false,
    preliminary: false,
    corrected: false,
    referenceRange: unit === 'ng/dL'
      ? { low: 0.92, high: 1.68 }
      : { low: 0.54, high: 1.4 },
    unitInferred: false,
    plotEligible: true,
  }
}

describe('CumulativeLabTrendDetail visible-window unit safety', () => {
  it('draws a recent trend when incompatible units exist only outside the selected range', () => {
    const chartPoints = [
      point('old-pmol-1', '2024-03-06T00:00:00.000Z', 1.96, 'pmol/L'),
      point('old-pmol-2', '2024-06-10T00:00:00.000Z', 1.57, 'pmol/L'),
      point('recent-ng-1', '2025-02-12T00:00:00.000Z', 0.49, 'ng/dL'),
      point('recent-ng-2', '2026-01-14T00:00:00.000Z', 1.38, 'ng/dL'),
    ]
    const series: LabTrendSeries = {
      selection: {
        categoryId: 'endocrine',
        mapKey: 'FT4',
        testKey: 'FT4',
        displayName: 'Free T4',
        nameMode: 'standardized',
      },
      points: chartPoints,
      chartPoints,
      chartable: false,
      unavailableReason: 'mixed-units',
      mixedUnits: true,
      mixedSpecimens: false,
      referenceRangesVary: true,
      sameDayMultiple: false,
      excluded: {
        invalidStatus: 0,
        missingDate: 0,
        nonNumeric: 0,
        comparator: 0,
      },
    }

    render(
      <LanguageProvider>
        <CumulativeLabTrendDetail series={series} />
      </LanguageProvider>,
    )

    expect(screen.getByRole('button', { name: '1 年' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('img', { name: /檢驗趨勢圖，共 2 筆/ })).toBeInTheDocument()
    expect(screen.queryByText(/所選時間範圍包含無法安全合併的不同單位/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '全部' }))
    expect(screen.getByText(/所選時間範圍包含無法安全合併的不同單位/)).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /檢驗趨勢圖/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '1 年' }))
    expect(screen.getByRole('img', { name: /檢驗趨勢圖，共 2 筆/ })).toBeInTheDocument()
  })
})
