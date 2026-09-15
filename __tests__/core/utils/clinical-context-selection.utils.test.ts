import {
  assessMedicationCurrentness,
  isMedicationCurrentlyInUse,
  isMedicationCurrentnessUncertain,
} from '@/src/core/utils/clinical-context-selection.utils'

const NOW = new Date('2026-09-11T12:00:00+08:00').getTime()

function withSupply(status: string | undefined, authoredOn: string, days: number) {
  return {
    ...(status === undefined ? {} : { status }),
    authoredOn,
    dispenseRequest: {
      expectedSupplyDuration: { value: days, unit: 'days', code: 'd' },
    },
  }
}

describe('medication currentness', () => {
  it.each([undefined, 'unknown', ' UNKNOWN '])(
    'uses an open supply window when source status is %p',
    (status) => {
      const medication = withSupply(status, '2026-09-08', 6)

      expect(assessMedicationCurrentness(medication, NOW)).toEqual({
        current: true,
        uncertain: false,
        basis: 'supply-window',
      })
      expect(isMedicationCurrentlyInUse(medication, NOW)).toBe(true)
      expect(isMedicationCurrentnessUncertain(medication, NOW)).toBe(false)
    },
  )

  it('uses an expired supply window to resolve unknown status as not current', () => {
    const medication = withSupply('unknown', '2026-09-01', 3)

    expect(assessMedicationCurrentness(medication, NOW)).toEqual({
      current: false,
      uncertain: false,
      basis: 'supply-window',
    })
  })

  it('is uncertain only when status and supply timing cannot resolve currentness', () => {
    const medication = { status: 'unknown', authoredOn: '2026-09-10' }

    expect(assessMedicationCurrentness(medication, NOW)).toEqual({
      current: false,
      uncertain: true,
      basis: 'insufficient-status-and-supply',
    })
    expect(isMedicationCurrentnessUncertain(medication, NOW)).toBe(true)
  })

  it('keeps an explicit negative status not current even with an open supply window', () => {
    const medication = withSupply('stopped', '2026-09-10', 30)

    expect(assessMedicationCurrentness(medication, NOW)).toEqual({
      current: false,
      uncertain: false,
      basis: 'source-status',
    })
  })

  it('uses active source status when no supply window can be computed', () => {
    expect(assessMedicationCurrentness({ status: 'active' }, NOW)).toEqual({
      current: true,
      uncertain: false,
      basis: 'source-status',
    })
  })
})
