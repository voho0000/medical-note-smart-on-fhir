import {
  medicationClinicalIdentityKey,
  medicationSourceCode,
  pickAiMedicationName,
} from '@/src/shared/utils/fhir-display-helpers'

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

describe('medication clinical identity', () => {
  const terminology = {
    officialProductUrl:
      'https://lmspiq.fda.gov.tw/web/DRPIQ/DRPIQ1000Result?licId=01034670',
    ingredientText: 'FOLIC ACID 5 MG',
    doseForm: '膜衣錠',
  }

  function medication(code: string, overrides: Record<string, unknown> = {}) {
    return {
      medicationCodeableConcept: {
        coding: [{
          system: 'https://twcore.mohw.gov.tw/CodeSystem/nhi-drug-code',
          code,
        }],
      },
      drugTerminology: terminology,
      ...overrides,
    }
  }

  it('groups NHI package-code variants of the same governed product', () => {
    const standardTablet = medication('AC34670100')
    const standardPackage = medication('AC346701G0')

    expect(medicationClinicalIdentityKey(standardTablet))
      .toBe(medicationClinicalIdentityKey(standardPackage))
    expect(medicationSourceCode(standardTablet)).toBe('AC34670100')
    expect(medicationSourceCode(standardPackage)).toBe('AC346701G0')
  })

  it('keeps the same ingredient separate when the official product differs', () => {
    const first = medication('NHI-A')
    const second = medication('NHI-B', {
      drugTerminology: {
        ...terminology,
        officialProductUrl:
          'https://lmspiq.fda.gov.tw/web/DRPIQ/DRPIQ1000Result?licId=99999999',
      },
    })

    expect(medicationClinicalIdentityKey(first))
      .not.toBe(medicationClinicalIdentityKey(second))
  })

  it('fails closed to the full source code when governed fields are incomplete', () => {
    const first = medication('AC34670100', {
      drugTerminology: {
        ...terminology,
        doseForm: undefined,
      },
    })
    const second = medication('AC346701G0', {
      drugTerminology: {
        ...terminology,
        doseForm: undefined,
      },
    })

    expect(medicationClinicalIdentityKey(first))
      .not.toBe(medicationClinicalIdentityKey(second))
  })
})
