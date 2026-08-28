import { fireEvent, render, screen, within } from '@testing-library/react'
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
        timelineMedicationStatus: '用藥狀態',
        timelineCurrentMedication: '目前用藥',
        timelineTimeMarkers: '時間標記',
        timelineToday: '今日',
        timelineAfterToday: '今日後',
        timelineEmpty: '此時段內無用藥紀錄',
        timelineOtherCategory: '其他',
        timelineAtcDetailLabel: '分類細節',
        timelineAtcBroad: '粗分',
        timelineAtcDetailed: '細分',
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

  beforeEach(() => {
    window.localStorage.clear()
  })

  it('groups prescription types separately from time markers', () => {
    jest.mocked(useMedicationTimeline).mockReturnValue({
      categories: [],
      drugs: [],
      domainStartMs: 0,
      domainEndMs: 1,
      totalDrugs: 25,
      totalRows: 25,
      chronicCount: 18,
      nonChronicCount: 7,
      organizationCount: 0,
    })

    render(<MedicationTimeline medications={[]} />)

    expect(screen.getByText('25 種藥')).toBeInTheDocument()

    const prescriptionTypes = screen.getByRole('group', { name: '處方類型' })
    expect(within(prescriptionTypes).getByText('慢箋')).toBeInTheDocument()
    expect(within(prescriptionTypes).getByText('18')).toBeInTheDocument()
    expect(within(prescriptionTypes).getByText('非慢箋')).toBeInTheDocument()
    expect(within(prescriptionTypes).getByText('7')).toBeInTheDocument()
    expect(screen.queryByText('急性')).not.toBeInTheDocument()

    const medicationStatus = screen.getByRole('group', { name: '用藥狀態' })
    expect(within(medicationStatus).getByText('目前用藥')).toBeInTheDocument()

    const timeMarkers = screen.getByRole('group', { name: '時間標記' })
    expect(within(timeMarkers).getByText('今日')).toBeInTheDocument()
    expect(within(timeMarkers).getByText('今日後')).toBeInTheDocument()
  })

  it('switches between ATC hierarchy and organization grouping', () => {
    jest.mocked(useMedicationTimeline).mockReturnValue({
      categories: [],
      drugs: [],
      domainStartMs: 0,
      domainEndMs: 1,
      totalDrugs: 1,
      totalRows: 1,
      chronicCount: 1,
      nonChronicCount: 0,
      organizationCount: 0,
    })

    render(<MedicationTimeline medications={[]} />)

    const grouping = screen.getByRole('group', { name: '分組方式' })
    const range = screen.getByRole('group', { name: '時段' })
    const atcButton = within(grouping).getByRole('button', { name: 'ATC 藥理' })
    const organizationButton = within(grouping).getByRole('button', { name: '醫療機構' })
    expect(grouping.closest('[data-timeline-primary-controls]'))
      .toBe(range.closest('[data-timeline-primary-controls]'))
    expect(atcButton).toHaveAttribute('aria-pressed', 'true')
    const categoryDetail = screen.getByRole('group', { name: '分類細節' })
    const broadButton = within(categoryDetail).getByRole('button', { name: '粗分' })
    const detailedButton = within(categoryDetail).getByRole('button', { name: '細分' })
    const primaryControls = grouping.closest('[data-timeline-primary-controls]')
    expect([...primaryControls!.children]).toEqual([
      range.parentElement,
      grouping.parentElement,
      categoryDetail.parentElement,
    ])
    expect(broadButton).toHaveAttribute('aria-pressed', 'false')
    expect(detailedButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('combobox', { name: '分類細節' })).not.toBeInTheDocument()

    fireEvent.click(organizationButton)
    expect(organizationButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('group', { name: '分類細節' })).not.toBeInTheDocument()
    expect(screen.queryByText('同一藥品跨機構時會分列顯示。')).not.toBeInTheDocument()
    expect(window.localStorage.getItem('medication-timeline-grouping')).toBe('organization')
    expect(jest.mocked(useMedicationTimeline).mock.calls.at(-1)?.[6]).toBe('organization')

    fireEvent.click(atcButton)
    fireEvent.click(within(screen.getByRole('group', { name: '分類細節' })).getByRole('button', { name: '粗分' }))
    expect(within(screen.getByRole('group', { name: '分類細節' })).getByRole('button', { name: '粗分' }))
      .toHaveAttribute('aria-pressed', 'true')
    expect(window.localStorage.getItem('medication-timeline-atc-level')).toBe('2')
    expect(jest.mocked(useMedicationTimeline).mock.calls.at(-1)?.[7]).toBe('2')

    fireEvent.click(within(screen.getByRole('group', { name: '分類細節' })).getByRole('button', { name: '細分' }))
    expect(window.localStorage.getItem('medication-timeline-atc-level')).toBe('4')
    expect(jest.mocked(useMedicationTimeline).mock.calls.at(-1)?.[7]).toBe('4')
  })

  it.each(['3', 'auto'])('migrates the old %s preference to detailed', (storedLevel) => {
    window.localStorage.setItem('medication-timeline-atc-level', storedLevel)
    jest.mocked(useMedicationTimeline).mockReturnValue({
      categories: [],
      drugs: [],
      domainStartMs: 0,
      domainEndMs: 1,
      totalDrugs: 0,
      totalRows: 0,
      chronicCount: 0,
      nonChronicCount: 0,
      organizationCount: 0,
    })

    render(<MedicationTimeline medications={[]} />)

    const categoryDetail = screen.getByRole('group', { name: '分類細節' })
    expect(within(categoryDetail).getByRole('button', { name: '細分' }))
      .toHaveAttribute('aria-pressed', 'true')
    expect(window.localStorage.getItem('medication-timeline-atc-level')).toBe('4')
  })
})
