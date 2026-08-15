import { render, screen } from '@testing-library/react'
import { ObservationTrendDialog } from '@/features/clinical-summary/reports/components/ObservationTrendDialog'

const observations = [
  {
    id: 'crp-1',
    status: 'final',
    code: { coding: [{ system: 'http://loinc.org', code: '1988-5', display: 'CRP' }] },
    effectiveDateTime: '2026-05-12',
    valueQuantity: { value: 0.5, unit: 'mg/dL' },
  },
  {
    id: 'crp-2',
    status: 'final',
    code: { coding: [{ system: 'http://loinc.org', code: '1988-5', display: 'CRP' }] },
    effectiveDateTime: '2026-08-12',
    valueQuantity: { value: 0.8, unit: 'mg/dL' },
  },
]

let mockClinicalObservations = observations

jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({
  useClinicalData: () => ({ observations: mockClinicalObservations, diagnosticReports: [], procedures: [] }),
}))

jest.mock('@/src/application/providers/audience.provider', () => ({
  useAudience: () => ({ audience: 'medical' }),
}))

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({ locale: 'zh-TW' }),
}))

jest.mock('@/features/clinical-summary/reports/context/report-name-mode.context', () => ({
  useReportNameMode: () => 'standardized',
}))

jest.mock('@/features/clinical-summary/reports/hooks/useObservationHistory', () => ({
  useObservationHistory: () => [],
  useComponentHistory: () => [],
  useCompositeHistory: () => [],
  useReportHistory: () => [],
}))

jest.mock('@/features/clinical-summary/reports/components/CumulativeLabTrendDetail', () => ({
  CumulativeLabTrendDetail: ({ series }: { series: { points: unknown[] } }) => (
    <div data-testid="unified-lab-trend">{series.points.length} points</div>
  ),
}))

describe('ObservationTrendDialog unified lab trend', () => {
  beforeEach(() => {
    mockClinicalObservations = observations
  })

  it('uses the cumulative-report trend surface for a scalar lab observation', () => {
    render(
      <ObservationTrendDialog
        observation={observations[1] as never}
        open
        onOpenChange={jest.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: /CRP.*檢驗趨勢/ })).toBeInTheDocument()
    expect(screen.getByTestId('unified-lab-trend')).toHaveTextContent('2 points')
    expect(screen.queryByRole('tab', { name: '歷史記錄' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '趨勢圖表' })).not.toBeInTheDocument()
  })

  it('uses the unified surface for an uncategorized nested numeric result', () => {
    mockClinicalObservations = []
    const uncategorizedNumericResult = {
      id: 'uncategorized-nested',
      status: 'final',
      code: { text: '未分類數值檢驗', coding: [] },
      effectiveDateTime: '2026-01-14',
      valueQuantity: { value: 33, unit: 'ug/dL' },
      referenceRange: [{ low: { value: 12, unit: 'ug/dL' }, high: { value: 66, unit: 'ug/dL' } }],
    }

    render(
      <ObservationTrendDialog
        observation={uncategorizedNumericResult as never}
        open
        onOpenChange={jest.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: /未分類數值檢驗.*檢驗趨勢/ })).toBeInTheDocument()
    expect(screen.getByTestId('unified-lab-trend')).toHaveTextContent('1 points')
    expect(screen.queryByRole('tab', { name: '歷史記錄' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '趨勢圖表' })).not.toBeInTheDocument()
  })
})
