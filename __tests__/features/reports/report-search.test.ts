import { rowInnerMatch } from '@/features/clinical-summary/reports/utils/report-search'
import type { Row } from '@/features/clinical-summary/reports/types'

function rowWithObservation(observation: any): Row {
  return {
    id: 'report-1',
    title: 'Basic metabolic panel',
    meta: 'Lab',
    obs: [observation],
    group: 'lab',
  }
}

describe('reports result search', () => {
  it('matches a numeric valueQuantity result and its unit', () => {
    const row = rowWithObservation({
      code: { text: '鈉' },
      valueQuantity: { value: 144, unit: 'mg/dL' },
    })

    expect(rowInnerMatch(row, '144')).toBe(true)
    expect(rowInnerMatch(row, '144 mg/dl')).toBe(true)
    expect(rowInnerMatch(row, '145')).toBe(false)
  })

  it('matches numeric results stored in panel components', () => {
    const row = rowWithObservation({
      code: { text: 'Blood pressure panel' },
      component: [{
        code: { text: 'Systolic blood pressure' },
        valueQuantity: { value: 165, unit: 'mmHg' },
      }],
    })

    expect(rowInnerMatch(row, '165')).toBe(true)
    expect(rowInnerMatch(row, '165 mmhg')).toBe(true)
  })

  it('keeps qualitative string and coded results searchable', () => {
    expect(rowInnerMatch(rowWithObservation({ valueString: 'Target Not Detected' }), 'not detected')).toBe(true)
    expect(rowInnerMatch(rowWithObservation({ valueCodeableConcept: { text: 'O positive' } }), 'positive')).toBe(true)
  })
})
