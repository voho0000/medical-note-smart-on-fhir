import { fireEvent, render, screen } from '@testing-library/react'
import { CancerScreeningRow } from '@/features/clinical-summary/reports/components/CancerScreeningRow'
import type { Row } from '@/features/clinical-summary/reports/types'
import { groupCancerScreeningRows } from '@/features/clinical-summary/reports/utils/cancer-screening-grouping'

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    t: {
      reports: {
        cancerScreeningRow: {
          result: '篩檢結果',
          latest: '最新',
          history: '歷次結果',
          recommendation: '篩檢建議',
          resultCount: '共 {n} 次',
          expand: '展開 {name} 的歷次結果與篩檢建議',
          collapse: '收合 {name} 的歷次結果與篩檢建議',
          noResult: '未提供結果',
          noRecommendation: '未提供篩檢建議',
        },
      },
    },
  }),
}))

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function makeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'screening-row',
    title: '大腸癌篩檢',
    meta: '癌篩',
    group: 'cancer-screening',
    obs: [{ valueString: '無異常' }],
    institution: '新北市聯合醫院;門診;0131020016',
    effectiveDate: '2023-04-20',
    ...overrides,
  }
}

function groupedColorectalRow(): Row {
  return groupCancerScreeningRows([
    makeRow(),
    makeRow({
      id: 'screening-older',
      institution: '三重衛生所',
      effectiveDate: '2016-12-16',
    }),
    makeRow({
      id: 'screening-recommendation',
      title: '大腸癌篩檢建議',
      obs: [{ valueString: '無異常：\n建議每2年定期接受糞便潛血檢查。' }],
      institution: undefined,
      effectiveDate: undefined,
    }),
  ])[0]
}

describe('CancerScreeningRow', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: ResizeObserverMock,
    })
  })

  it('summarizes a screening programme with its latest result', () => {
    const { container } = render(<CancerScreeningRow row={groupedColorectalRow()} />)

    expect(screen.getByText('大腸癌篩檢')).toBeInTheDocument()
    expect(screen.getByText('最新')).toBeInTheDocument()
    expect(screen.getByText('無異常')).toBeInTheDocument()
    expect(screen.getByText('共 2 次')).toBeInTheDocument()
    expect(screen.getByLabelText('新北市聯合醫院')).toBeInTheDocument()
    expect(container.querySelector('time[datetime="2023-04-20"]')).toBeInTheDocument()
    expect(screen.queryByText('建議每2年定期接受糞便潛血檢查。')).not.toBeInTheDocument()
  })

  it('opens result history and the programme-level recommendation together', () => {
    const { container } = render(<CancerScreeningRow row={groupedColorectalRow()} />)

    fireEvent.click(screen.getByRole('button', {
      name: '展開 大腸癌篩檢 的歷次結果與篩檢建議',
    }))

    expect(screen.getByText('歷次結果')).toBeInTheDocument()
    expect(container.querySelector('time[datetime="2016-12-16"]')).toBeInTheDocument()
    expect(screen.getByLabelText('三重衛生所')).toBeInTheDocument()
    expect(screen.getByText('篩檢建議')).toBeInTheDocument()
    expect(screen.getByText('建議每2年定期接受糞便潛血檢查。')).toBeInTheDocument()
    expect(screen.queryByText('無異常： 建議每2年定期接受糞便潛血檢查。')).not.toBeInTheDocument()
  })

  it('does not show a toggle when there is no history or recommendation', () => {
    render(<CancerScreeningRow row={makeRow()} />)

    expect(screen.queryByText('篩檢結果')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('共 1 次')).toBeInTheDocument()
  })

  it('auto-opens the group when search matches hidden content', () => {
    render(<CancerScreeningRow row={groupedColorectalRow()} query="糞便潛血" />)

    expect(screen.getByText('歷次結果')).toBeInTheDocument()
    expect(screen.getByText(/建議每2年定期接受/)).toBeInTheDocument()
  })
})
