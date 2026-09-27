import {
  buildIcdCodeReference,
  extractBilledIcd10Codes,
  templateRequestsIcd9,
  type IcdCrosswalk,
} from '@/src/core/utils/icd-code-reference.utils'

const label = '-     ICD codes on visit record (billing, not confirmed diagnoses): '
const context = [
  'Visits & Treatment History:',
  '- ▶ 2026-01-01 · Clinic A',
  `${label}I10 - Essential hypertension; E11.9 - Type 2 diabetes`,
  '- ▶ 2026-02-01 · Clinic B',
  `${label}I10 - Essential hypertension`,
  '- ▶ 2026-03-01 · Clinic A',
  `${label}R05.3 - Chronic cough`,
  'Lab Reports:',
  'HbA1c 7.1 (mentions I25.10 outside billing)',
].join('\n')

const crosswalk: IcdCrosswalk = {
  map: { I10: ['4019'], E119: ['25000'] },
  names: { '4019': 'Unspecified essential hypertension', '25000': 'Diabetes mellitus without mention of complication, type II or unspecified type, not stated as uncontrolled' },
}

describe('ICD code reference', () => {
  it('detects templates that ask for ICD-9 codes', () => {
    expect(templateRequestsIcd9('A RULES: ICD-9 block then ICD-10 block')).toBe(true)
    expect(templateRequestsIcd9('list icd 9 codes')).toBe(true)
    expect(templateRequestsIcd9('Summarize ICD-10 billing reasons')).toBe(false)
  })

  it('lists each billed ICD-10 code once, in first-seen order, from billing lines only', () => {
    expect([...extractBilledIcd10Codes(context)]).toEqual([
      ['I10', 'Essential hypertension'],
      ['E11.9', 'Type 2 diabetes'],
      ['R05.3', 'Chronic cough'],
    ])
  })

  it('builds a counted, terminated reference with CMS equivalents or an explicit gap', () => {
    expect(buildIcdCodeReference(context, crosswalk)).toBe(
      'ICD code reference: 3 distinct billed code(s) in this record. ICD-9-CM equivalents were computed by software ' +
      'with the CMS 2018 General Equivalence Mapping; this is a code translation, not a record entry, and billing codes are not confirmed diagnoses. ' +
      'No other ICD code exists in this record.\n' +
      '1. billed ICD-10-CM I10 Essential hypertension | ICD-9-CM equivalent: 401.9 UNSPECIFIED ESSENTIAL HYPERTENSION\n' +
      '2. billed ICD-10-CM E11.9 Type 2 diabetes | ICD-9-CM equivalent: 250.00 DIABETES MELLITUS WITHOUT MENTION OF COMPLICATION, TYPE II OR UNSPECIFIED TYPE, NOT STATED AS UNCONTROLLED\n' +
      '3. billed ICD-10-CM R05.3 Chronic cough | ICD-9-CM equivalent: (no ICD-9-CM equivalent)\n' +
      'End of ICD code reference (3 code(s)).\n\n',
    )
  })

  it('formats E-codes with four digits before the decimal point', () => {
    const reference = buildIcdCodeReference(`${label}W01.0XXA - Fall`, {
      map: { W010XXA: ['E8850'] }, names: { E8850: 'Fall from (nonmotorized) scooter' },
    })
    expect(reference).toContain('ICD-9-CM equivalent: E885.0 FALL FROM (NONMOTORIZED) SCOOTER')
  })

  it('returns nothing when the record has no billed code', () => {
    expect(buildIcdCodeReference('Lab Reports:\nnone', crosswalk)).toBe('')
  })
})
