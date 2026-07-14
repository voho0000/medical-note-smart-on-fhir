import { render, screen } from '@testing-library/react'
import { ReportsCard } from '@/features/clinical-summary/reports/ReportsCard'
import { useResourceNavigationStore } from '@/src/application/stores/resource-navigation.store'

const mockUseClinicalData = jest.fn()
const mockUseReportsData = jest.fn((_reports: unknown[], _imagingStudies: unknown[]) => ({
  reportRows: [],
  seenIds: new Set<string>(),
}))

jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({
  useClinicalData: () => mockUseClinicalData(),
}))

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    t: {
      common: { loading: 'Loading', error: 'Error' },
      errors: { unknown: 'Unknown' },
      reports: {
        title: '診斷報告',
        noData: '在選定的時間範圍內未找到報告。',
        tabs: {
          cumulative: '累積報告',
          all: '全部',
          lab: '檢驗',
          imaging: '影像',
          vitals: '生命徵象',
          procedures: '處置',
        },
      },
    },
  }),
}))

jest.mock('@/features/clinical-summary/reports/hooks/useReportsData', () => ({
  useReportsData: (reports: unknown[], imagingStudies: unknown[]) => (
    mockUseReportsData(reports, imagingStudies)
  ),
}))

jest.mock('@/features/clinical-summary/reports/hooks/useProcedureRows', () => ({
  useProcedureRows: () => [],
}))

jest.mock('@/features/clinical-summary/reports/hooks/useOrphanObservations', () => ({
  useOrphanObservations: () => [],
}))

jest.mock('@/features/clinical-summary/reports/components/CumulativeLabReport', () => ({
  CumulativeLabReport: ({
    observations,
    activeCategoryId,
    focusAnalyteKey,
    focusNonce,
  }: {
    observations: unknown[]
    activeCategoryId?: string
    focusAnalyteKey?: string
    focusNonce?: number
  }) => (
    <div data-testid="cumulative-report">
      observations: {observations.length}; category: {activeCategoryId}; focus: {focusAnalyteKey}; nonce: {focusNonce}
    </div>
  ),
}))

jest.mock('@/features/clinical-summary/reports/components/ReportsTabContent', () => ({
  ReportsTabContent: () => null,
}))

describe('ReportsCard lazy cumulative loading', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useResourceNavigationStore.setState({
      pending: {
        resourceType: 'Observation',
        resourceId: 'obs-1',
        reportView: 'cumulative',
        cumulativeCategoryId: 'chem',
        cumulativeAnalyteKey: 'CRP',
      },
      seq: 1,
      consumedSeq: 0,
    })
    mockUseClinicalData.mockReturnValue({
      diagnosticReports: [],
      imagingStudies: [],
      observations: [{ id: 'obs-1', resourceType: 'Observation' }],
      procedures: [],
      isLoading: false,
      error: null,
    })
  })

  it('keeps the cumulative report visible while raw report rows are deferred', () => {
    render(<ReportsCard />)

    expect(mockUseReportsData).toHaveBeenCalledWith([], [])
    expect(screen.getByTestId('cumulative-report')).toHaveTextContent('observations: 1')
    expect(screen.getByTestId('cumulative-report')).toHaveTextContent('category: chem')
    expect(screen.getByTestId('cumulative-report')).toHaveTextContent('focus: CRP')
    expect(screen.getByTestId('cumulative-report')).toHaveTextContent('nonce: 1')
    expect(screen.queryByText('在選定的時間範圍內未找到報告。')).not.toBeInTheDocument()
  })
})
