import {
  calculateAfTtr,
  calculateHasBled,
  HAS_BLED,
} from '@/features/medical-calculator/calculators/af-followup'
const input = {
  asOf: '2026-09-19',
  interrupted: false,
  mechanicalValve: false,
  prostheticValveRecord: false,
}
describe('AF follow-up calculators', () => {
  it('uses the same HAS-BLED scoring function as the calculator catalog', () => {
    const v = {
      htn: 'yes',
      renal: 'no',
      liver: '',
      stroke: 'yes',
      bleeding: 'no',
      inr: 'no',
      elderly: 'yes',
      drugs: 'no',
      alcohol: 'no',
    }
    const r = HAS_BLED.compute(v)!
    const shared = calculateHasBled(
      Object.fromEntries(
        Object.entries(v).map(([k, v]) => [k, v === 'yes' ? true : v === 'no' ? false : undefined]),
      ),
    )
    expect(r.numericValue).toBe(shared.numericValue)
    expect(r.completeness).toMatchObject({
      complete: shared.complete,
      upperBound: shared.upperBound,
      missingKeys: shared.missingInputs,
    })
  })
  it('interpolates actual time in, below and above range instead of percent of samples', () => {
    const r = calculateAfTtr({
      ...input,
      series: [
        { date: '2026-09-01', value: 1 },
        { date: '2026-09-11', value: 4 },
      ],
    })
    expect(r.percent).toBeCloseTo(100 / 3)
    expect(r.belowPercent).toBeCloseTo(100 / 3)
    expect(r.abovePercent).toBeCloseTo(100 / 3)
    expect(r.evaluatedDays).toBe(10)
  })
  it('keeps values on range boundaries fully therapeutic without extrapolation', () => {
    expect(
      calculateAfTtr({
        ...input,
        series: [
          { date: '2026-09-01', value: 2 },
          { date: '2026-09-11', value: 2 },
        ],
      }),
    ).toMatchObject({ percent: 100, evaluatedDays: 10, end: '2026-09-11' })
  })
  it('blocks interrupted therapy, unconfirmed valve targets and conflicting dates', () => {
    const series = [
      { date: '2026-09-01', value: 2 },
      { date: '2026-09-11', value: 3 },
    ]
    expect(calculateAfTtr({ ...input, series, interrupted: true }).percent).toBeUndefined()
    expect(calculateAfTtr({ ...input, series, interrupted: undefined }).percent).toBeUndefined()
    expect(calculateAfTtr({ ...input, series, mechanicalValve: true }).percent).toBeUndefined()
    expect(
      calculateAfTtr({ ...input, series: [...series, { date: '2026-09-01', value: 4 }] }).reason,
    ).toBe('conflicting-same-day')
  })
  it('excludes long gaps, nonfinite/future samples and does not extrapolate', () => {
    const r = calculateAfTtr({
      ...input,
      series: [
        { date: '2026-03-01', value: 2 },
        { date: '2026-08-01', value: 2 },
        { date: '2026-09-01', value: 2 },
        { date: '2026-10-01', value: 4 },
        { date: '2026-09-02', value: NaN },
      ],
    })
    expect(r).toMatchObject({
      percent: 100,
      evaluatedDays: 31,
      start: '2026-08-01',
      end: '2026-09-01',
    })
    expect(r.excludedDays).toBeGreaterThan(0)
  })
  it('keeps incomplete HAS-BLED as a range', () => {
    expect(calculateHasBled({ age: true, renal: false, stroke: undefined })).toEqual({
      numericValue: 1,
      upperBound: 2,
      complete: false,
      missingInputs: ['stroke'],
    })
  })
})

describe('HAS-BLED item definitions (ACC/AHA 2023 Figure 11; AF spec RT-15)', () => {
  const label = (key: string) => HAS_BLED.inputs.find((i) => i.key === key)!.label.en
  it('states age ≥65, liver criteria as any one, and alcohol ≥8 as provisional', () => {
    expect(HAS_BLED.version).toBe('1.2.0')
    expect(label('elderly')).toBe('Age ≥65')
    expect(label('liver')).toContain('any one')
    expect(label('liver')).not.toContain('AND')
    expect(label('alcohol')).toContain('≥8')
    expect(HAS_BLED.reference).toContain('Figure 11')
  })
})
