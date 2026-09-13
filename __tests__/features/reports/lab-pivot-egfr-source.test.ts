import { buildLabPivots } from '@/src/shared/utils/lab-pivot.utils'

const obs = (value: number | undefined, nhi: boolean, date = '2026-09-09', name = 'eGFR (CKD-EPI)') => ({
  code: { text: name }, effectiveDateTime: date,
  valueQuantity: { value, unit: 'mL/min/1.73m2' },
  method: { text: nhi ? '健保署計算' : '院所回報' },
})
const value = (observations: ReturnType<typeof obs>[], preferInstitutionEgfr = true) =>
  buildLabPivots(observations, { preferInstitutionEgfr }).chem.rows
    .find(row => row.testKey === 'EGFR(EPI)')?.values.get('2026-09-09')?.value

it('prefers institution eGFR regardless of source order or numeric equality', () => {
  expect(value([obs(83.2, true), obs(83.2, false)])).toBe('83.2')
  expect(value([obs(80, false), obs(83.2, true)])).toBe('80')
  expect(value([obs(83.2, true), obs(80, false)])).toBe('80')
})
it('retains NHI results when no usable institution value exists for that date and assay', () => {
  expect(value([obs(83.2, true)])).toBe('83.2')
  expect(value([obs(undefined, false), obs(83.2, true)])).toBe('83.2')
  expect(value([obs(83.2, true), obs(80, false, '2026-09-04')])).toBe('83.2')
  expect(value([obs(83.2, true), obs(80, false, '2026-09-09', 'eGFR')])).toBe('83.2')
})
it('keeps the original records and other consumers unchanged', () => {
  const observations = [obs(83.2, true), obs(83.2, false)]
  expect(value(observations, false)).toBe('83.2 / 83.2')
  value(observations)
  expect(observations).toHaveLength(2)
})
