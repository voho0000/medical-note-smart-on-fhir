import {
  displayDosageInstruction,
  humanDosageFrequency,
} from '@/features/clinical-summary/medications/utils/dose-helpers'

describe('humanDosageFrequency', () => {
  it('preserves a composite hospital SIG code from dosage text', () => {
    expect(humanDosageFrequency({ text: '1 tablet QDPC' })).toBe('QDPC')
  })

  it('combines a timing code with structured after-meal timing', () => {
    expect(humanDosageFrequency({
      timing: {
        code: { coding: [{ code: 'BID' }] },
        repeat: { when: ['PC'] },
      },
    })).toBe('BIDPC')
  })

  it('combines a derived daily frequency with an additional instruction', () => {
    expect(humanDosageFrequency({
      timing: {
        repeat: { frequency: 2, period: 1, periodUnit: 'd' },
      },
      additionalInstruction: [{ text: 'after meals' }],
    })).toBe('BIDPC')
  })

  it('preserves an unsupported source instruction instead of dropping it', () => {
    expect(humanDosageFrequency({ text: 'HOSPITAL-LOCAL-SIG' }))
      .toBe('HOSPITAL-LOCAL-SIG')
  })

  it('uses the complete source dosage text for display', () => {
    expect(displayDosageInstruction({ text: '1 tablet QDPC' }))
      .toBe('1 tablet QDPC')
  })

  it('falls back to structured frequency when source dosage text is absent', () => {
    expect(displayDosageInstruction({
      timing: { repeat: { frequency: 2, period: 1, periodUnit: 'd' } },
    })).toBe('BID')
  })

  it('does not present dispensing arithmetic as the SIG', () => {
    expect(displayDosageInstruction({
      text: '給藥總量 15，給藥日數 30 天（平均每日 0.5）',
    })).toBe('')
  })

  it('keeps an actual SIG code when dispensing arithmetic follows it', () => {
    expect(displayDosageInstruction({
      text: 'QOD；給藥總量 15，給藥日數 30 天',
    })).toBe('QOD')
  })
})
