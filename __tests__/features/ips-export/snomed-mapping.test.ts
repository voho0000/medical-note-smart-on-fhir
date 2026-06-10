import {
  SCT_SYSTEM,
  findSctForCondition,
  lookupSctForIcd,
  normalizeIcd,
} from '@/features/ips-export/utils/snomed-mapping'
import type { ConditionEntity } from '@/src/core/entities/clinical-data.entity'

describe('normalizeIcd', () => {
  it('uppercases and strips whitespace', () => {
    expect(normalizeIcd(' e11.9 ')).toBe('E11.9')
  })

  it('re-inserts the dot for a dotless code with an extension', () => {
    expect(normalizeIcd('E119')).toBe('E11.9')
    expect(normalizeIcd('n186')).toBe('N18.6')
    expect(normalizeIcd('i2510')).toBe('I25.10')
  })

  it('leaves a 3-char category root untouched', () => {
    expect(normalizeIcd('I10')).toBe('I10')
    expect(normalizeIcd('J44')).toBe('J44')
  })

  it('drops a trailing dot', () => {
    expect(normalizeIcd('E11.')).toBe('E11')
  })

  it('returns empty string for nullish / blank input', () => {
    expect(normalizeIcd(undefined)).toBe('')
    expect(normalizeIcd('')).toBe('')
    expect(normalizeIcd('   ')).toBe('')
  })
})

describe('lookupSctForIcd — root-keyed (homogeneous) categories', () => {
  it('maps the full code via its 3-char root', () => {
    expect(lookupSctForIcd('E11.9')).toEqual({ code: '44054006', display: 'Diabetes mellitus type II' })
    expect(lookupSctForIcd('E11')).toEqual({ code: '44054006', display: 'Diabetes mellitus type II' })
  })

  it('maps a single-code category (I10) at the root', () => {
    expect(lookupSctForIcd('I10')).toEqual({ code: '59621000', display: 'Essential hypertension' })
  })

  it('maps a dotless code by re-inserting the dot then rooting', () => {
    expect(lookupSctForIcd('J449')).toEqual({ code: '13645005', display: 'Chronic obstructive lung disease' })
  })
})

describe('lookupSctForIcd — exact-keyed (heterogeneous) categories', () => {
  it('prefers the exact N18.6 (ESRD) over the N18 (CKD) root', () => {
    expect(lookupSctForIcd('N18.6')).toEqual({ code: '46177005', display: 'End stage kidney disease' })
    // Any other N18 subcode falls through to the CKD root.
    expect(lookupSctForIcd('N18.3')).toEqual({ code: '709044004', display: 'Chronic kidney disease' })
    expect(lookupSctForIcd('N18')).toEqual({ code: '709044004', display: 'Chronic kidney disease' })
  })

  it('maps only the cirrhosis leaves of the heterogeneous K74 category', () => {
    expect(lookupSctForIcd('K74.6')).toEqual({ code: '19943007', display: 'Cirrhosis of liver' })
    expect(lookupSctForIcd('K74.60')).toEqual({ code: '19943007', display: 'Cirrhosis of liver' })
    // A non-cirrhosis K74 leaf (hepatic fibrosis) is intentionally NOT coded.
    expect(lookupSctForIcd('K74.0')).toBeNull()
  })

  it('maps E78.5 (hyperlipidemia) but not other E78 lipid disorders', () => {
    expect(lookupSctForIcd('E78.5')).toEqual({ code: '55822004', display: 'Hyperlipidemia' })
    expect(lookupSctForIcd('E78.0')).toBeNull()
  })

  it('maps the atherosclerotic-heart-disease leaves of I25', () => {
    expect(lookupSctForIcd('I25.10')).toEqual({ code: '53741008', display: 'Coronary arteriosclerosis' })
    expect(lookupSctForIcd('I25.1')).toEqual({ code: '53741008', display: 'Coronary arteriosclerosis' })
    // Old MI (I25.2) is a clinically different disorder — not coded here.
    expect(lookupSctForIcd('I25.2')).toBeNull()
  })

  it('maps C22.0 (hepatocellular) but not other C22 liver-cancer leaves', () => {
    expect(lookupSctForIcd('C22.0')).toEqual({ code: '109841003', display: 'Hepatocarcinoma' })
    expect(lookupSctForIcd('C22.1')).toBeNull()
  })
})

describe('lookupSctForIcd — unmapped / invalid input', () => {
  it('returns null for an ICD code not in the allowlist', () => {
    expect(lookupSctForIcd('Z00.0')).toBeNull()
    // Asthma (J45) was intentionally excluded pending a verified concept id.
    expect(lookupSctForIcd('J45.909')).toBeNull()
  })

  it('returns null for non-ICD-shaped strings', () => {
    expect(lookupSctForIcd('not-a-code')).toBeNull()
    expect(lookupSctForIcd('44054006')).toBeNull()
    expect(lookupSctForIcd(undefined)).toBeNull()
  })
})

describe('findSctForCondition', () => {
  it('returns a high-confidence annotation for an ICD-10-coded condition', () => {
    const condition: ConditionEntity = {
      id: 'c1',
      code: {
        text: '第二型糖尿病',
        coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: 'E11.9', display: 'Type 2 diabetes mellitus' }],
      },
    }
    expect(findSctForCondition(condition)).toEqual({
      system: SCT_SYSTEM,
      code: '44054006',
      display: 'Diabetes mellitus type II',
      confidence: 'high',
      icd10: 'E11.9',
    })
  })

  it('matches an ICD coding that omits the system (bridge sometimes does)', () => {
    const condition: ConditionEntity = {
      id: 'c2',
      code: { coding: [{ code: 'I10' }] },
    }
    expect(findSctForCondition(condition)?.code).toBe('59621000')
  })

  it('ignores codings from a non-ICD system', () => {
    const condition: ConditionEntity = {
      id: 'c3',
      code: { coding: [{ system: 'http://snomed.info/sct', code: '44054006' }] },
    }
    expect(findSctForCondition(condition)).toBeNull()
  })

  it('returns the first ICD coding that maps', () => {
    const condition: ConditionEntity = {
      id: 'c4',
      code: {
        coding: [
          { system: 'http://hl7.org/fhir/sid/icd-10', code: 'Z00.0' }, // unmapped
          { system: 'http://hl7.org/fhir/sid/icd-10', code: 'E11.9' }, // mapped
        ],
      },
    }
    expect(findSctForCondition(condition)?.code).toBe('44054006')
  })

  it('returns null when no coding maps', () => {
    const condition: ConditionEntity = {
      id: 'c5',
      code: { text: 'Some uncoded problem', coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: 'Z99.9' }] },
    }
    expect(findSctForCondition(condition)).toBeNull()
  })
})
