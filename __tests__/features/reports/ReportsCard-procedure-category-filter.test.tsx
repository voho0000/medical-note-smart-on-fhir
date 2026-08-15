import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ReportsCard } from '@/features/clinical-summary/reports/ReportsCard'
import type { Row } from '@/features/clinical-summary/reports/types'
import { useResourceNavigationStore } from '@/src/application/stores/resource-navigation.store'

const procedureRows: Row[] = [
  {
    id: 'procedure:surgical',
    title: '手術處置',
    meta: 'Procedure • completed',
    obs: [],
    group: 'procedures',
    procedureCategory: 'surgical-procedure',
  },
  {
    id: 'procedure:major',
    title: '重大處置',
    meta: 'Procedure • completed',
    obs: [],
    group: 'procedures',
    procedureCategory: 'major-procedure',
  },
  {
    id: 'procedure:outpatient',
    title: '門診小處置',
    meta: 'Procedure • completed',
    obs: [],
    group: 'procedures',
    procedureCategory: 'outpatient-treatment',
  },
  {
    id: 'procedure:legacy',
    title: '舊版未分類處置',
    meta: 'Procedure • completed',
    obs: [],
    group: 'procedures',
  },
]

jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({
  useClinicalData: () => ({
    diagnosticReports: [],
    imagingStudies: [],
    observations: [],
    procedures: procedureRows.map((row) => ({ id: row.id })),
    isLoading: false,
    error: null,
  }),
}))

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    locale: 'zh-TW',
    t: {
      common: { loading: '載入中', error: '錯誤' },
      errors: { unknown: '未知錯誤' },
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
      procedures: {
        categoryFilterLabel: '處置分類',
        categoryAll: '全部',
        categoryUncategorized: '未分類',
        categoryLabels: {
          'surgical-procedure': '手術',
          'major-procedure': '重大處置',
          'outpatient-treatment': '門診治療／小處置',
        },
      },
    },
  }),
}))

jest.mock('@/features/clinical-summary/reports/hooks/useReportsData', () => ({
  useReportsData: () => ({ reportRows: [], seenIds: new Set<string>() }),
}))

jest.mock('@/features/clinical-summary/reports/hooks/useProcedureRows', () => ({
  useProcedureRows: (procedures: unknown[]) => procedures.length > 0 ? procedureRows : [],
}))

jest.mock('@/features/clinical-summary/reports/hooks/useOrphanObservations', () => ({
  useOrphanObservations: () => [],
}))

jest.mock('@/features/clinical-summary/reports/components/CumulativeLabReport', () => ({
  CumulativeLabReport: () => null,
}))

jest.mock('@/features/clinical-summary/reports/components/ReportsTabContent', () => ({
  ReportsTabContent: ({ value, rows }: { value: string; rows: Row[] }) => (
    <div data-testid={`tab-${value}`}>
      {rows.map((row) => <span key={row.id}>{row.title}</span>)}
    </div>
  ),
}))

describe('ReportsCard procedure category badges', () => {
  beforeEach(() => {
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
    useResourceNavigationStore.setState({ pending: null, seq: 0, consumedSeq: 0 })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('filters procedure rows by source-derived category and preserves legacy rows', async () => {
    render(<ReportsCard />)

    fireEvent.mouseDown(screen.getByRole('tab', { name: /處置/ }), {
      button: 0,
      ctrlKey: false,
    })

    const filterGroup = await screen.findByRole('group', { name: '處置分類' })
    const procedureTab = within(screen.getByTestId('tab-procedures'))
    expect(filterGroup).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /全部/ })).toHaveAttribute('aria-pressed', 'true')
    expect(await procedureTab.findByText('舊版未分類處置')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /重大處置/ }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /重大處置/ })).toHaveAttribute('aria-pressed', 'true')
      expect(procedureTab.getByText('重大處置')).toBeInTheDocument()
      expect(procedureTab.queryByText('手術處置')).not.toBeInTheDocument()
      expect(procedureTab.queryByText('門診小處置')).not.toBeInTheDocument()
      expect(procedureTab.queryByText('舊版未分類處置')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /未分類/ }))
    await waitFor(() => {
      expect(procedureTab.getByText('舊版未分類處置')).toBeInTheDocument()
    })
  })
})
