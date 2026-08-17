import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ReportsCard } from '@/features/clinical-summary/reports/ReportsCard'
import { useResourceNavigationStore } from '@/src/application/stores/resource-navigation.store'

const mockUseClinicalData = jest.fn()
const mockUseReportsData = jest.fn((_reports: unknown[], _imagingStudies: unknown[], _nameMode: string) => ({
  reportRows: [],
  seenIds: new Set<string>(),
}))
const mockUseReportTabCounts = jest.fn()

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

jest.mock('@/features/clinical-summary/reports/hooks/useReportTabCounts', () => ({
  useReportTabCounts: () => mockUseReportTabCounts(),
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
    nameModeControl,
  }: {
    observations: unknown[]
    activeCategoryId?: string
    focusAnalyteKey?: string
    focusNonce?: number
    nameModeControl?: ReactNode
  }) => (
    <div data-testid="cumulative-report">
      {nameModeControl}
      observations: {observations.length}; category: {activeCategoryId}; focus: {focusAnalyteKey}; nonce: {focusNonce}
    </div>
  ),
}))

jest.mock('@/features/clinical-summary/reports/components/ReportsTabContent', () => ({
  ReportsTabContent: ({
    value,
    isActive,
    isPreparing,
  }: {
    value: string
    isActive: boolean
    isPreparing: boolean
  }) => (
    <div
      data-testid={`raw-report-${value}`}
      data-active={isActive ? 'true' : 'false'}
      data-preparing={isPreparing ? 'true' : 'false'}
    />
  ),
}))

describe('ReportsCard lazy cumulative loading', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseReportTabCounts.mockReturnValue({
      all: 119,
      lab: 31,
      imaging: 7,
      vitals: 10,
      procedures: 2,
    })
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
    Object.defineProperty(window, 'requestIdleCallback', {
      configurable: true,
      value: jest.fn(() => 1),
    })
    Object.defineProperty(window, 'cancelIdleCallback', {
      configurable: true,
      value: jest.fn(),
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
      procedures: [{ id: 'proc-1', resourceType: 'Procedure' }],
      isLoading: false,
      error: null,
    })
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
    Object.defineProperty(window, 'requestIdleCallback', {
      configurable: true,
      value: undefined,
    })
    Object.defineProperty(window, 'cancelIdleCallback', {
      configurable: true,
      value: undefined,
    })
  })

  it('paints the report shell before cumulative and raw report work begins', async () => {
    const diagnosticReports = [{ id: 'report-1', resourceType: 'DiagnosticReport' }]
    const imagingStudies = [{ id: 'study-1', resourceType: 'ImagingStudy' }]
    mockUseClinicalData.mockReturnValue({
      diagnosticReports,
      imagingStudies,
      observations: [{ id: 'obs-1', resourceType: 'Observation' }],
      procedures: [{ id: 'proc-1', resourceType: 'Procedure' }],
      isLoading: false,
      error: null,
    })

    render(<ReportsCard />)

    expect(screen.queryByTestId('cumulative-report')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(mockUseReportsData).toHaveBeenLastCalledWith([], [], 'standardized')
    expect(mockUseReportsData).not.toHaveBeenCalledWith(
      diagnosticReports,
      imagingStudies,
      'standardized',
    )
    expect(screen.getByRole('tab', { name: '全部 (119)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '檢驗 (31)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '影像 (7)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '生命徵象 (10)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '處置 (2)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand to fullscreen' })).toHaveClass('@min-[1160px]:px-2')
    expect(screen.getByText('Fullscreen')).toHaveClass('hidden', '@min-[1160px]:inline')
    expect(document.querySelector('[data-tour="report-tabs"][role="tablist"]')).toHaveClass(
      'pr-12',
      '@min-[1160px]:pr-28',
    )
    const cumulative = await screen.findByTestId('cumulative-report')
    expect(cumulative).toHaveTextContent('observations: 1')
    expect(cumulative).toHaveTextContent('category: chem')
    expect(cumulative).toHaveTextContent('focus: CRP')
    expect(cumulative).toHaveTextContent('nonce: 1')
    expect(screen.getByRole('switch', { name: '名稱顯示' })).toBeChecked()
    expect(screen.queryByText('在選定的時間範圍內未找到報告。')).not.toBeInTheDocument()
  })

  it('performance contract: selects a raw tab before any projection work is enabled', () => {
    jest.useFakeTimers()
    const frameCallbacks: FrameRequestCallback[] = []
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameCallbacks.push(callback)
      return frameCallbacks.length
    })
    const diagnosticReports = [{ id: 'report-1', resourceType: 'DiagnosticReport' }]
    mockUseClinicalData.mockReturnValue({
      diagnosticReports,
      imagingStudies: [],
      observations: [{ id: 'obs-1', resourceType: 'Observation' }],
      procedures: [{ id: 'proc-1', resourceType: 'Procedure' }],
      isLoading: false,
      error: null,
    })
    useResourceNavigationStore.setState({ pending: null, seq: 0, consumedSeq: 0 })

    render(<ReportsCard />)

    fireEvent.mouseDown(screen.getByRole('tab', { name: /全部/ }), {
      button: 0,
      ctrlKey: false,
    })

    expect(screen.getByRole('tab', { name: /全部/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('raw-report-all')).toHaveAttribute('data-active', 'true')
    expect(screen.getByTestId('raw-report-all')).toHaveAttribute('data-preparing', 'true')
    expect(mockUseReportsData).toHaveBeenLastCalledWith([], [], 'standardized')

    // Even after the browser reaches the next frame, the heavy projection is
    // still behind a timer/transition. This ordering is the performance
    // contract: the selected state gets a paint opportunity first.
    act(() => {
      frameCallbacks.splice(0).forEach((callback) => callback(16))
    })
    expect(mockUseReportsData).toHaveBeenLastCalledWith([], [], 'standardized')
    expect(screen.getByTestId('raw-report-all')).toHaveAttribute('data-preparing', 'true')

    act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(mockUseReportsData).toHaveBeenLastCalledWith(
      diagnosticReports,
      [],
      'standardized',
    )
    expect(screen.getByTestId('raw-report-all')).toHaveAttribute('data-preparing', 'false')

    fireEvent.mouseDown(screen.getByRole('tab', { name: /影像/ }), {
      button: 0,
      ctrlKey: false,
    })
    expect(screen.getByRole('tab', { name: /影像/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('raw-report-all')).toBeInTheDocument()
    expect(screen.getByTestId('raw-report-all')).toHaveAttribute('data-active', 'false')

    fireEvent.mouseDown(screen.getByRole('tab', { name: /全部/ }), {
      button: 0,
      ctrlKey: false,
    })
    // Once visited, both raw views stay mounted and switching back requires no
    // preparation phase or repeat projection.
    expect(screen.getByRole('tab', { name: /全部/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('raw-report-all')).toHaveAttribute('data-preparing', 'false')
    expect(screen.getByTestId('raw-report-imaging')).toBeInTheDocument()
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
