import {
  getSystolicDiastolicBloodPressureSummary,
  isSystolicDiastolicBloodPressureRow,
} from '@/features/clinical-summary/reports/utils/blood-pressure-panel'
import type { Row } from '@/features/clinical-summary/reports/types'

function bloodPressureRow(
  systolic: { value?: number; unit?: string; code?: string } = { value: 128, unit: 'mmHg' },
  diastolic: { value?: number; unit?: string; code?: string } = { value: 76, unit: 'mmHg' },
): Row {
  return {
    id: 'blood-pressure',
    title: 'Blood pressure',
    meta: 'Vital signs • final',
    group: 'vitals',
    obs: [{
      id: 'blood-pressure-observation',
      code: { text: 'Blood pressure panel' },
      component: [
        {
          code: { coding: [{ system: 'http://loinc.org', code: '8480-6' }] },
          valueQuantity: systolic,
        },
        {
          code: { coding: [{ system: 'http://loinc.org', code: '8462-4' }] },
          valueQuantity: diastolic,
        },
      ],
    }],
  }
}

describe('blood-pressure-panel', () => {
  it('formats a complete coded panel as one familiar reading', () => {
    const row = bloodPressureRow()

    expect(isSystolicDiastolicBloodPressureRow(row)).toBe(true)
    expect(getSystolicDiastolicBloodPressureSummary(row)).toBe('128/76 mmHg')
  })

  it('recognizes bilingual labels when standard codes are absent', () => {
    const row = bloodPressureRow()
    row.obs[0].component = [
      { code: { text: '收縮壓' }, valueQuantity: { value: 121, unit: 'mmHg' } },
      { code: { text: 'Diastolic blood pressure' }, valueQuantity: { value: 79, unit: 'mmHg' } },
    ]

    expect(getSystolicDiastolicBloodPressureSummary(row)).toBe('121/79 mmHg')
  })

  it('falls back when either pressure value is missing', () => {
    expect(getSystolicDiastolicBloodPressureSummary(
      bloodPressureRow({ value: 128, unit: 'mmHg' }, { unit: 'mmHg' }),
    )).toBeNull()
  })

  it('does not imply a shared unit when source units differ', () => {
    expect(getSystolicDiastolicBloodPressureSummary(
      bloodPressureRow({ value: 17.1, unit: 'kPa' }, { value: 76, unit: 'mmHg' }),
    )).toBe('17.1 kPa / 76 mmHg')
  })

  it('uses the coded unit when a source omits the display unit', () => {
    expect(getSystolicDiastolicBloodPressureSummary(
      bloodPressureRow({ value: 128, code: 'mm[Hg]' }, { value: 76, code: 'mm[Hg]' }),
    )).toBe('128/76 mm[Hg]')
  })

  it('does not combine pressures from separate source observations', () => {
    const row = bloodPressureRow()
    row.obs = [
      {
        id: 'systolic-only',
        component: [row.obs[0].component![0]],
      },
      {
        id: 'diastolic-only',
        component: [row.obs[0].component![1]],
      },
    ]

    expect(getSystolicDiastolicBloodPressureSummary(row)).toBeNull()
  })
})
