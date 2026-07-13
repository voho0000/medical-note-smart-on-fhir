import { pickAiMedicationName } from '@/src/shared/utils/fhir-display-helpers'

describe('pickAiMedicationName', () => {
  it('prefers the first non-empty English coding display over localized text', () => {
    expect(pickAiMedicationName({
      text: '福適佳膜衣錠10毫克',
      coding: [
        { code: 'empty-display', display: '  ' },
        { code: 'BC26476100', display: 'Forxiga Film-coated Tablets 10mg' },
      ],
    })).toBe('Forxiga Film-coated Tablets 10mg')
  })

  it('falls back to source text and then medicationReference display', () => {
    expect(pickAiMedicationName({ text: '中文來源藥名' })).toBe('中文來源藥名')
    expect(pickAiMedicationName(undefined, 'Referenced medication')).toBe('Referenced medication')
  })
})
