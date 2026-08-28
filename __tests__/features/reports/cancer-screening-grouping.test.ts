import type { Row } from '@/features/clinical-summary/reports/types'
import {
  cancerScreeningProgramTitle,
  groupCancerScreeningRows,
} from '@/features/clinical-summary/reports/utils/cancer-screening-grouping'

function row(id: string, title: string, date?: string, institution?: string): Row {
  return {
    id,
    title,
    meta: '癌篩',
    group: 'cancer-screening',
    obs: [{ id: `obs-${id}`, valueString: title.includes('建議') ? '建議定期檢查' : '無異常' }],
    effectiveDate: date,
    institution,
  }
}

describe('groupCancerScreeningRows', () => {
  it('groups results and recommendations by screening programme', () => {
    const grouped = groupCancerScreeningRows([
      row('colorectal-new', '大腸癌篩檢', '2023-04-20', '新北市聯醫'),
      row('breast', '乳癌篩檢', '2023-03-13', '明新診所'),
      row('colorectal-old', '大腸癌篩檢', '2016-12-16', '三重衛生所'),
      row('cervical', '子宮頸抹片篩檢', '2016-12-16', '三重衛生所'),
      row('colorectal-advice', '大腸癌篩檢建議'),
      row('breast-advice', '乳癌篩檢建議'),
      row('cervical-advice', '子宮頸抹片篩檢建議'),
    ])

    expect(grouped).toHaveLength(3)
    expect(grouped.map((item) => item.title)).toEqual([
      '大腸癌篩檢',
      '乳癌篩檢',
      '子宮頸抹片篩檢',
    ])
    expect(grouped[0]).toMatchObject({
      effectiveDate: '2023-04-20',
      institution: '新北市聯醫',
    })
    expect(grouped[0].groupedRows?.map((item) => item.id)).toEqual([
      'colorectal-new',
      'colorectal-old',
      'colorectal-advice',
    ])
    expect(grouped[0].obs.map((observation) => observation.id)).toEqual([
      'obs-colorectal-new',
      'obs-colorectal-old',
      'obs-colorectal-advice',
    ])
  })

  it('preserves non-cancer rows and inserts one group at the first programme row', () => {
    const lab: Row = {
      id: 'lab',
      title: 'CREA',
      meta: 'Lab',
      group: 'lab',
      obs: [],
    }
    const grouped = groupCancerScreeningRows([
      lab,
      row('colorectal-new', '大腸癌篩檢', '2023-04-20'),
      row('colorectal-advice', '大腸癌篩檢建議'),
    ])

    expect(grouped).toHaveLength(2)
    expect(grouped[0]).toBe(lab)
    expect(grouped[1].title).toBe('大腸癌篩檢')
  })

  it('normalizes only the recommendation suffix', () => {
    expect(cancerScreeningProgramTitle('大腸癌篩檢建議')).toBe('大腸癌篩檢')
    expect(cancerScreeningProgramTitle('乳癌篩檢')).toBe('乳癌篩檢')
  })
})
