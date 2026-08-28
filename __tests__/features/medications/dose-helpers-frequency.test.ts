import { humanDosageFrequency } from '@/features/clinical-summary/medications/utils/dose-helpers'

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

  it('does not invent a frequency when the source provides none', () => {
    expect(humanDosageFrequency({ text: 'take one tablet' })).toBe('')
  })
})
