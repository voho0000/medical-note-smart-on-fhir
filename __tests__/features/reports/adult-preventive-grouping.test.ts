import { groupAdultPreventiveRows } from '@/features/clinical-summary/reports/utils/adult-preventive-grouping'
import type { Row } from '@/features/clinical-summary/reports/types'

function row(id: string, overrides: Partial<Row> = {}): Row {
  return {
    id,
    title: id,
    meta: 'Observation',
    obs: [{ id: `obs-${id}`, code: { text: id }, valueString: id }],
    group: 'other',
    institution: '良安診所',
    effectiveDate: '2024-06-28T00:00:00+08:00',
    sourceProgram: 'adult-preventive',
    ...overrides,
  }
}

function codedRow(id: string, code: string): Row {
  return row(id, {
    obs: [{
      id: `obs-${id}`,
      code: { coding: [{ code }], text: id },
      valueString: id,
    }],
  })
}

describe('groupAdultPreventiveRows', () => {
  it('folds one date and institution into one display group', () => {
    const output = groupAdultPreventiveRows([
      row('CHOL', { group: 'lab' }),
      row('Blood Pressure', { group: 'vitals' }),
      row('血脂肪檢查結果'),
    ])

    expect(output).toHaveLength(1)
    expect(output[0]).toMatchObject({
      adultPreventiveGroup: true,
      sourceProgram: 'adult-preventive',
      institution: '良安診所',
      effectiveDate: '2024-06-28T00:00:00+08:00',
    })
    expect(output[0].groupedRows?.map((member) => member.id)).toEqual([
      'Blood Pressure',
      'CHOL',
      '血脂肪檢查結果',
    ])
  })

  it('keeps different dates and institutions in separate groups', () => {
    const output = groupAdultPreventiveRows([
      row('new-exam'),
      row('older-exam', { effectiveDate: '2021-04-05' }),
      row('other-clinic', { institution: '另一診所' }),
    ])

    expect(output).toHaveLength(3)
    expect(output.every((candidate) => candidate.adultPreventiveGroup)).toBe(true)
    expect(new Set(output.map((candidate) => candidate.id))).toHaveProperty('size', 3)
  })

  it('does not absorb an ordinary same-day report', () => {
    const ordinary = row('ordinary', { sourceProgram: undefined, group: 'lab' })
    const output = groupAdultPreventiveRows([row('adult'), ordinary])

    expect(output).toHaveLength(2)
    expect(output[0].adultPreventiveGroup).toBe(true)
    expect(output[1]).toBe(ordinary)
  })

  it('leaves undated adult preventive rows ungrouped', () => {
    const undated = row('undated', { effectiveDate: undefined })

    expect(groupAdultPreventiveRows([undated])).toEqual([undated])
  })

  it('follows the original adult preventive-health section order', () => {
    const output = groupAdultPreventiveRows([
      codedRow('Body Height', '8302-2'),
      codedRow('Body Weight', '29463-7'),
      codedRow('BMI', '39156-5'),
      codedRow('Waist Circumference', '8280-0'),
      codedRow('CHOL', '2093-3'),
      codedRow('TG', '2571-8'),
      codedRow('HDL Cholesterol', '2085-9'),
      codedRow('LDL Cholesterol', '2089-1'),
      codedRow('GLUCOSE-AC', '1558-6'),
      codedRow('BUN', '3094-0'),
      codedRow('CREA', '2160-0'),
      codedRow('eGFR', '77147-7'),
      codedRow('UA', '3084-1'),
      codedRow('PROT', '20454-5'),
      row('代謝症候群篩檢 (Metabolic Syndrome Screening)'),
      codedRow('AST', '1920-8'),
      codedRow('ALT', '1742-6'),
      codedRow('Blood Pressure', '85354-9'),
      codedRow('血壓檢查結果', 'blood-pressure'),
      codedRow('血脂肪檢查結果', 'blood-lipids'),
      codedRow('血糖檢查結果', 'blood-glucose'),
      codedRow('腎功能檢查結果', 'renal-function'),
      codedRow('肝功能檢查結果', 'liver-function'),
    ])

    expect(output[0].groupedRows?.map((member) => member.id)).toEqual([
      'Body Height',
      'Body Weight',
      'BMI',
      'Waist Circumference',
      'Blood Pressure',
      '血壓檢查結果',
      'CHOL',
      'TG',
      'HDL Cholesterol',
      'LDL Cholesterol',
      '血脂肪檢查結果',
      'GLUCOSE-AC',
      '血糖檢查結果',
      'BUN',
      'CREA',
      'eGFR',
      '腎功能檢查結果',
      'UA',
      'PROT',
      '代謝症候群篩檢 (Metabolic Syndrome Screening)',
      'AST',
      'ALT',
      '肝功能檢查結果',
    ])
  })
})
