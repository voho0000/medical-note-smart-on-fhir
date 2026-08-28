import { fireEvent, render, screen } from '@testing-library/react'

import { VisitHistoryCard } from '@/features/clinical-summary/visit-history/components/VisitHistoryCard'

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    locale: 'zh-TW',
    t: {
      common: { loading: '載入中' },
      errors: { fetchClinicalData: '載入失敗' },
      procedures: { noData: '無資料' },
      visitHistory: {
        searchPlaceholder: '搜尋',
        sortLabel: '排序',
        sortDateDesc: '日期（新→舊）',
        sortDateAsc: '日期（舊→新）',
        sortAbnormal: '異常優先',
        careDisciplineLabel: '醫別',
        careDisciplineCompact: '醫別',
        careDisciplines: { western: '西醫', tcm: '中醫', dental: '牙醫' },
        typeLabel: '類型',
        typeCompact: '類型',
        badges: {
          outpatient: '門診',
          'outpatient-or-emergency': '門急診',
          inpatient: '住院',
          emergency: '急診',
          pharmacy: '藥局',
        },
        institutionCompact: '機構',
        institutionAll: '所有機構',
        medications: '用藥',
        hasMedications: '含用藥',
        tests: '檢驗',
        hasTests: '含檢驗',
        examReportsShort: '檢查',
        hasReports: '含檢查',
        procedures: '處置',
        hasProcedures: '含處置',
        dischargeShort: '病摘',
        hasDischarge: '含出院病摘',
        clearFilters: '清除篩選',
        clearFiltersShort: '清除',
        recordsUnit: '筆',
        noMatch: '沒有符合資料',
      },
    },
  }),
}))

jest.mock('@/src/application/providers/audience.provider', () => ({
  useAudience: () => ({ audience: 'medical' }),
}))

jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({
  useClinicalData: () => ({
    encounters: [{}],
    medications: [],
    diagnosticReports: [],
    observations: [],
    procedures: [],
    conditions: [],
    documentReferences: [],
    compositions: [],
    resourceReady: {
      encounters: true,
      medications: true,
      diagnosticReports: true,
      observations: true,
      procedures: true,
      conditions: true,
      documentReferences: true,
      compositions: true,
    },
    error: null,
  }),
}))

jest.mock('@/features/clinical-summary/visit-history/hooks/useVisitHistory', () => ({
  useVisitHistory: () => ([
    {
      id: 'enc-1',
      date: '2026-08-12',
      type: 'outpatient',
      careDiscipline: 'western',
      institution: '示範醫院',
    },
    {
      id: 'enc-2',
      date: '2026-08-11',
      type: 'outpatient',
      careDiscipline: 'western',
      institution: '示範醫院',
    },
  ]),
}))

jest.mock('@/features/clinical-summary/visit-history/hooks/useEncounterDetails', () => ({
  useEncounterDetails: () => new Map(),
}))

jest.mock('@/features/clinical-summary/visit-history/hooks/useClinicalNotes', () => ({
  useClinicalNotes: () => [],
}))

jest.mock('@/features/clinical-summary/visit-history/hooks/useVisitStats', () => ({
  useVisitStats: () => new Map([['enc-1', {
    hasMedications: true,
    hasTests: true,
    hasReports: true,
    hasProcedures: true,
    abnormalCount: 0,
  }], ['enc-2', {
    hasMedications: false,
    hasTests: false,
    hasReports: false,
    hasProcedures: false,
    abnormalCount: 0,
  }]]),
}))

jest.mock('@/features/clinical-summary/medications/hooks/useMedicationRows', () => ({
  useMedicationRows: () => [],
}))

jest.mock('@/features/clinical-summary/document-summary/hooks/useDocumentSummaries', () => ({
  useDocumentSummaries: () => ({
    entries: [{ encounterRef: 'Encounter/enc-1', isDischargeSummary: true }],
  }),
}))

jest.mock('@/features/clinical-summary/document-summary/utils/strings', () => ({
  useDocumentSummaryStrings: () => ({ docTypes: {} }),
}))

jest.mock('@/src/application/stores/resource-navigation.store', () => ({
  useResourceNavigationStore: (selector: (state: { pending: null; seq: number }) => unknown) => (
    selector({ pending: null, seq: 0 })
  ),
}))

jest.mock('@/features/clinical-summary/visit-history/components/VisitItem', () => ({
  VisitItem: ({ visit }: { visit: { id: string } }) => <li>{visit.id}</li>,
}))

describe('VisitHistoryCard filter layout', () => {
  it('keeps selects and content badges in one non-wrapping filter strip', () => {
    render(<VisitHistoryCard />)

    const strip = screen.getByTestId('visit-filter-strip')
    expect(strip).toHaveClass('flex-nowrap', 'overflow-x-auto')
    expect(strip).not.toHaveClass('flex-wrap')
    expect(strip.querySelector('.basis-full')).toBeNull()
    expect(screen.getByText('2 筆')).not.toBeNull()
  })

  it('restores the medication content filter and filters visits with medications', () => {
    render(<VisitHistoryCard />)

    const medicationFilter = screen.getByRole('button', { name: '含用藥' })
    expect(medicationFilter).toHaveTextContent('用藥')
    expect(medicationFilter).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(medicationFilter)

    expect(medicationFilter).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('enc-1')).toBeInTheDocument()
    expect(screen.queryByText('enc-2')).not.toBeInTheDocument()
    expect(screen.getByText('1 / 2 筆')).toBeInTheDocument()
  })
})
