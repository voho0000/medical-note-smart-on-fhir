import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ReportsCard } from '@/features/clinical-summary/reports/ReportsCard'
import { useResourceNavigationStore } from '@/src/application/stores/resource-navigation.store'

const mockUseClinicalData = jest.fn()
const mockUseReportsData = jest.fn((_reports: unknown[], _imagingStudies: unknown[], _nameMode: string) => ({
  reportRows: [],
  seenIds: new Set<string>(),
}))

const activeNameSwitches = () => screen.queryAllByRole('switch', { name: '名稱顯示' })
  .filter((element) => !element.closest('[data-slot="tabs-content"][data-state="inactive"]'))

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
        nameDisplay: {
          label: '名稱顯示',
          original: '原始名稱',
          standardized: '標準化名稱',
        },
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
  useReportsData: (reports: unknown[], imagingStudies: unknown[], nameMode: string) => (
    mockUseReportsData(reports, imagingStudies, nameMode)
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
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
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

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('keeps the cumulative report visible while raw report rows are deferred', () => {
    render(<ReportsCard />)

    expect(mockUseReportsData).toHaveBeenCalledWith([], [], 'standardized')
    expect(screen.getByTestId('cumulative-report')).toHaveTextContent('observations: 1')
    expect(screen.getByTestId('cumulative-report')).toHaveTextContent('category: chem')
    expect(screen.getByTestId('cumulative-report')).toHaveTextContent('focus: CRP')
    expect(screen.getByTestId('cumulative-report')).toHaveTextContent('nonce: 1')
    expect(screen.getByRole('switch', { name: '名稱顯示' })).toBeChecked()
    expect(screen.queryByText('在選定的時間範圍內未找到報告。')).not.toBeInTheDocument()
  })

  it('shares the name mode across cumulative, all, lab, imaging, and vitals tabs', async () => {
    useResourceNavigationStore.setState({ pending: null, seq: 0, consumedSeq: 0 })
    render(<ReportsCard />)

    const toggle = screen.getByRole('switch', { name: '名稱顯示' })
    expect(toggle).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: '原始名稱' }))
    expect(toggle).not.toBeChecked()

    fireEvent.mouseDown(screen.getByRole('tab', { name: /全部/ }), { button: 0, ctrlKey: false })
    await waitFor(() => expect(activeNameSwitches()).toHaveLength(1))
    expect(activeNameSwitches()[0]).not.toBeChecked()

    fireEvent.mouseDown(screen.getByRole('tab', { name: /影像/ }), { button: 0, ctrlKey: false })
    await waitFor(() => expect(activeNameSwitches()).toHaveLength(1))
    expect(activeNameSwitches()[0]).not.toBeChecked()
    expect(mockUseReportsData).toHaveBeenLastCalledWith([], [], 'original')

    fireEvent.mouseDown(screen.getByRole('tab', { name: /檢驗/ }), { button: 0, ctrlKey: false })
    await waitFor(() => expect(activeNameSwitches()).toHaveLength(1))
    expect(activeNameSwitches()[0]).not.toBeChecked()

    fireEvent.mouseDown(screen.getByRole('tab', { name: /生命徵象/ }), { button: 0, ctrlKey: false })
    await waitFor(() => expect(activeNameSwitches()).toHaveLength(1))
    expect(activeNameSwitches()[0]).not.toBeChecked()
    await waitFor(() => {
      expect(mockUseReportsData).toHaveBeenLastCalledWith([], [], 'original')
    })
  })
})
