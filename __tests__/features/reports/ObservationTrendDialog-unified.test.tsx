import { render, screen } from '@testing-library/react'
import { ObservationTrendDetail } from '@/features/clinical-summary/reports/components/ObservationTrendDetail'

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
let mockObservationHistory: Array<{
  id: string
  date: string
  value: string
}> = []

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
  useObservationHistory: () => mockObservationHistory,
  useComponentHistory: () => [],
  useCompositeHistory: () => [],
  useReportHistory: () => [],
}))

jest.mock('@/features/clinical-summary/reports/components/CumulativeLabTrendDetail', () => ({
  CumulativeLabTrendDetail: ({ series }: { series: { points: unknown[] } }) => (
    <div data-testid="unified-lab-trend">{series.points.length} points</div>
  ),
}))

describe('ObservationTrendDetail unified right-pane content', () => {
  beforeEach(() => {
    mockClinicalObservations = observations
    mockObservationHistory = []
  })

  it('uses the cumulative-report trend surface for a scalar lab observation', () => {
    render(
      <ObservationTrendDetail
        observation={observations[1] as never}
      />,
    )

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
      <ObservationTrendDetail
        observation={uncategorizedNumericResult as never}
      />,
    )

    expect(screen.getByTestId('unified-lab-trend')).toHaveTextContent('1 points')
    expect(screen.queryByRole('tab', { name: '歷史記錄' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '趨勢圖表' })).not.toBeInTheDocument()
  })

  it('shows history without an empty trend tab for a text result', () => {
    mockClinicalObservations = []
    mockObservationHistory = [{
      id: 'culture-1',
      date: '2026-08-12',
      value: 'No growth',
    }]
    const textResult = {
      id: 'culture-1',
      status: 'final',
      code: { text: 'Aerobic Culture', coding: [] },
      effectiveDateTime: '2026-08-12',
      valueString: 'No growth',
    }

    render(
      <ObservationTrendDetail
        observation={textResult as never}
      />,
    )

    expect(screen.getByText('No growth')).toBeInTheDocument()
    expect(screen.getByText('共 1 筆記錄')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '歷史記錄' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '趨勢圖表' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('unified-lab-trend')).not.toBeInTheDocument()
  })
})
