import { fireEvent, render, screen, within } from '@testing-library/react'
import { ProblemListCard } from '@/features/clinical-summary/problem-list/ProblemListCard'
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import { useLanguage } from '@/src/application/providers/language.provider'
import { zhTW } from '@/src/shared/i18n/locales/zh-TW'

jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook')
jest.mock('@/src/application/providers/language.provider')
jest.mock('@/src/application/hooks/use-resource-anchor.hook', () => ({ useResourceAnchor: () => undefined }))

const ICD = 'http://hl7.org/fhir/sid/icd-10-cm'

function mockData({
  conditions = [] as any[],
  encounters = [] as any[],
  conditionsReady = true,
  encountersReady = true,
}) {
  jest.mocked(useClinicalData).mockReturnValue({
    conditions,
    encounters,
    resourceReady: { conditions: conditionsReady, encounters: encountersReady },
    error: null,
  } as any)
}

const medcloudVisits = [
  { id: 'e1', class: { code: 'AMB' }, period: { start: '2025-10-03' }, reasonCode: [{ text: '第二型糖尿病', coding: [{ system: ICD, code: 'E11.9' }] }] },
  { id: 'e2', class: { code: 'AMB' }, period: { start: '2026-09-10' }, reasonCode: [{ text: '第二型糖尿病', coding: [{ system: ICD, code: 'E11.9' }] }] },
  { id: 'e3', class: { code: 'AMB' }, period: { start: '2026-01-15' }, reasonCode: [{ text: '急性上呼吸道感染', coding: [{ system: ICD, code: 'J06.9' }] }] },
]

describe('ProblemListCard', () => {
  beforeEach(() => {
    jest.mocked(useLanguage).mockReturnValue({ t: zhTW, locale: 'zh-TW' } as any)
  })

  it('lists visit primary diagnoses for a source with no Condition (雲端病歷)', () => {
    mockData({ encounters: medcloudVisits })
    render(<ProblemListCard />)

    const section = screen.getByTestId('visit-primary-diagnoses')
    expect(within(section).getByText('就醫主診斷')).toBeInTheDocument()
    expect(within(section).getByText('非確診')).toBeInTheDocument()
    const rows = within(section).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('E11.9 第二型糖尿病')
    expect(rows[0]).toHaveTextContent('共 2 次')
    expect(rows[1]).toHaveTextContent('J06.9 急性上呼吸道感染')
    expect(rows[1]).toHaveTextContent('共 1 次')
    expect(screen.queryByText(/無問題清單/)).not.toBeInTheDocument()
    // No Condition → no status pills that would filter nothing.
    expect(screen.queryByRole('button', { name: '進行中' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '已解決' })).not.toBeInTheDocument()
  })

  it('does not call the card empty while encounters are still loading', () => {
    mockData({ encounters: [], encountersReady: false })
    render(<ProblemListCard />)
    expect(screen.queryByText(/無問題清單/)).not.toBeInTheDocument()
  })

  it('shows the empty state only when neither section has anything', () => {
    mockData({})
    render(<ProblemListCard />)
    expect(screen.getByText(/無問題清單/)).toBeInTheDocument()
  })

  it('keeps a Condition-only source unchanged: no section headings, filters work', () => {
    mockData({
      conditions: [
        { id: 'c1', code: { text: 'Hypertension' }, clinicalStatus: 'active' },
        { id: 'c2', code: { text: 'Viral sinusitis' }, clinicalStatus: 'resolved' },
      ],
    })
    render(<ProblemListCard />)

    expect(screen.queryByText('已登錄診斷')).not.toBeInTheDocument()
    expect(screen.queryByTestId('visit-primary-diagnoses')).not.toBeInTheDocument()
    expect(screen.getByText('Hypertension')).toBeInTheDocument()
    expect(screen.queryByText('Viral sinusitis')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '全部' }))
    expect(screen.getByText('Viral sinusitis')).toBeInTheDocument()
  })

  it('filters visit diagnoses by CCIR chronicity; Z codes only under 全部', () => {
    mockData({
      encounters: [
        ...medcloudVisits,
        { id: 'e5', period: { start: '2026-03-01' }, reasonCode: [{ text: '長期使用胰島素', coding: [{ system: ICD, code: 'Z79.4' }] }] },
      ],
    })
    render(<ProblemListCard />)
    const section = screen.getByTestId('visit-primary-diagnoses')
    const codes = () => within(section).queryAllByRole('listitem').map((li) => li.textContent?.split(' ')[0])

    expect(codes()).toEqual(['E11.9', 'Z79.4', 'J06.9'])
    fireEvent.click(within(section).getByRole('button', { name: '慢性' }))
    expect(codes()).toEqual(['E11.9'])
    fireEvent.click(within(section).getByRole('button', { name: '非慢性' }))
    expect(codes()).toEqual(['J06.9'])
    fireEvent.click(within(section).getByRole('button', { name: '全部' }))
    expect(codes()).toHaveLength(3)
  })

  it('says so when a chronicity filter leaves nothing', () => {
    mockData({ encounters: [medcloudVisits[2]] })
    render(<ProblemListCard />)
    const section = screen.getByTestId('visit-primary-diagnoses')
    fireEvent.click(within(section).getByRole('button', { name: '慢性' }))
    expect(within(section).getByText('目前篩選下沒有項目')).toBeInTheDocument()
  })

  it('shows both sections under their headings when a source has 重大傷病 and visits', () => {
    mockData({
      conditions: [{ id: 'c1', code: { text: '惡性腫瘤', coding: [{ system: ICD, code: 'C50.911' }] } }],
      encounters: [
        ...medcloudVisits,
        { id: 'e4', period: { start: '2026-02-01' }, reasonCode: [{ text: '乳癌', coding: [{ system: ICD, code: 'C50911' }] }] },
      ],
    })
    render(<ProblemListCard />)

    expect(screen.getByText('已登錄診斷')).toBeInTheDocument()
    expect(screen.getByText('惡性腫瘤')).toBeInTheDocument()
    const section = screen.getByTestId('visit-primary-diagnoses')
    // The 重大傷病 code is not repeated as a visit diagnosis.
    expect(within(section).queryByText(/C50/)).not.toBeInTheDocument()
    expect(within(section).getAllByRole('listitem')).toHaveLength(2)
    // Two 全部 buttons, each inside its own named group.
    expect(within(screen.getByRole('group', { name: '依狀態篩選' })).getByRole('button', { name: '全部' })).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: '依慢性分類篩選' })).getByRole('button', { name: '全部' })).toBeInTheDocument()
  })
})
