import { act, render, waitFor } from '@testing-library/react'
import { ReportsCard } from '@/features/clinical-summary/reports/ReportsCard'
import { useResourceNavigationStore } from '@/src/application/stores/resource-navigation.store'

const mockUseClinicalData = jest.fn()
const mockUseReportsData = jest.fn()
const mockReportsTabContent = jest.fn((_props: unknown) => null)

type CapturedTabProps = {
  value: string
  scrollToId?: string | null
  scrollNonce?: number
  onScrollResolved?: (nonce?: number) => void
}

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
        noData: '沒有報告',
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
  useReportsData: () => mockUseReportsData(),
}))

jest.mock('@/features/clinical-summary/reports/hooks/useProcedureRows', () => ({
  useProcedureRows: () => [],
}))

jest.mock('@/features/clinical-summary/reports/hooks/useOrphanObservations', () => ({
  useOrphanObservations: () => [],
}))

jest.mock('@/features/clinical-summary/reports/components/CumulativeLabReport', () => ({
  CumulativeLabReport: () => null,
}))

jest.mock('@/features/clinical-summary/reports/components/ReportsTabContent', () => ({
  ReportsTabContent: (props: unknown) => mockReportsTabContent(props),
}))

describe('ReportsCard source navigation', () => {
  beforeEach(() => {
    const mergedRow = {
      id: 'dr-head',
      diagnosticReportIds: ['dr-head', 'dr-cited'],
      title: '胸部影像報告',
      rawTitle: '胸部影像報告',
      meta: 'Radiology • final',
      obs: [{
        id: 'dr-summary-dr-head',
        code: { text: 'Report Summary' },
        valueString: 'Imaging report content',
      }],
      group: 'imaging',
      effectiveDate: '2026-06-01T00:00:00+08:00',
    }

    mockUseClinicalData.mockReturnValue({
      diagnosticReports: [{ id: 'dr-head' }, { id: 'dr-cited' }],
      imagingStudies: [],
      observations: [],
      procedures: [],
      isLoading: false,
      error: null,
    })
    mockUseReportsData.mockReturnValue({
      reportRows: [mergedRow],
      seenIds: new Set<string>(),
    })
    useResourceNavigationStore.setState({
      pending: {
        resourceType: 'DiagnosticReport',
        resourceId: 'dr-cited',
        display: '胸部影像報告',
      },
      seq: 1,
    })
  })

  afterEach(() => {
    useResourceNavigationStore.setState({ pending: null })
  })

  it('scrolls to the rendered row when the citation targets a non-head merged report', async () => {
    render(<ReportsCard />)

    let targetedAllTab: CapturedTabProps | undefined
    await waitFor(() => {
      targetedAllTab = mockReportsTabContent.mock.calls
        .map(([props]) => props as CapturedTabProps)
        .find((props) => props.value === 'all' && props.scrollToId === 'dr-head')

      expect(targetedAllTab).toBeDefined()
    })

    // Merely finding a data row is not success: the virtualized destination
    // must confirm that the DOM row was mounted and highlighted.
    expect(useResourceNavigationStore.getState().pending?.resourceId).toBe('dr-cited')
    act(() => targetedAllTab?.onScrollResolved?.(targetedAllTab.scrollNonce))

    expect(useResourceNavigationStore.getState().pending).toBeNull()
  })
})
