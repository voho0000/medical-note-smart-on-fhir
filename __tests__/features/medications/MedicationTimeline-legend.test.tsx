import { render, screen, within } from '@testing-library/react'
import { MedicationTimeline } from '@/features/clinical-summary/medications/timeline/MedicationTimeline'
import { useMedicationTimeline } from '@/features/clinical-summary/medications/timeline/hooks/useMedicationTimeline'

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    locale: 'zh-TW',
    t: {
      medications: {
        chronic: '慢箋',
        timelineRangeLabel: '時段',
        timelineRange3m: '3 個月',
        timelineRange6m: '6 個月',
        timelineRange1y: '1 年',
        timelineRange3y: '3 年',
        timelineRangeAll: '全部',
        timelineDrugCount: '種藥',
        timelinePrescriptionType: '處方類型',
        timelineNonChronic: '非慢箋',
        timelineTimeMarkers: '時間標記',
        timelineToday: '今日',
        timelineAfterToday: '今日後',
        timelineEmpty: '此時段內無用藥紀錄',
        timelineOtherCategory: '其他',
        timelineAtcCategories: {},
      },
    },
  }),
}))

jest.mock('@/src/application/providers/audience.provider', () => ({
  useAudience: () => ({ audience: 'medical' }),
}))

jest.mock('@/features/clinical-summary/medications/timeline/hooks/useMedicationTimeline', () => ({
  useMedicationTimeline: jest.fn(),
}))

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('MedicationTimeline legend', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: ResizeObserverMock,
    })
  })

  it('groups prescription types separately from time markers', () => {
    jest.mocked(useMedicationTimeline).mockReturnValue({
      categories: [],
      drugs: [],
      domainStartMs: 0,
      domainEndMs: 1,
      totalDrugs: 25,
      chronicCount: 18,
      nonChronicCount: 7,
    })

    render(<MedicationTimeline medications={[]} />)

    expect(screen.getByText('25 種藥')).toBeInTheDocument()

    const prescriptionTypes = screen.getByRole('group', { name: '處方類型' })
    expect(within(prescriptionTypes).getByText('慢箋')).toBeInTheDocument()
    expect(within(prescriptionTypes).getByText('18')).toBeInTheDocument()
    expect(within(prescriptionTypes).getByText('非慢箋')).toBeInTheDocument()
    expect(within(prescriptionTypes).getByText('7')).toBeInTheDocument()
    expect(screen.queryByText('急性')).not.toBeInTheDocument()

    const timeMarkers = screen.getByRole('group', { name: '時間標記' })
    expect(within(timeMarkers).getByText('今日')).toBeInTheDocument()
    expect(within(timeMarkers).getByText('今日後')).toBeInTheDocument()
  })
})
