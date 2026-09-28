import { icdChronicity } from '@/src/shared/utils/icd-chronicity'
import { CCIR_PREFIXES, CCIR_VERSION } from '@/src/shared/constants/ccir-chronicity.generated'

describe('icdChronicity (AHRQ HCUP CCIR)', () => {
  it('classifies the CCIR guide examples: diabetes, hypertension, cancer chronic; infections not chronic', () => {
    expect(icdChronicity('E11.9')).toBe('chronic')
    expect(icdChronicity('I10')).toBe('chronic')
    expect(icdChronicity('C50.911')).toBe('chronic')
    expect(icdChronicity('J06.9')).toBe('nonChronic')
    expect(icdChronicity('J18.9')).toBe('nonChronic')
  })

  it('accepts dotted, dot-free and lower-case codes alike', () => {
    expect(icdChronicity('N18.32')).toBe('chronic')
    expect(icdChronicity('N1832')).toBe('chronic')
    expect(icdChronicity('n18.32')).toBe('chronic')
  })

  it('gives Z and V–Y codes no determination', () => {
    expect(icdChronicity('Z79.4')).toBe('undetermined')
    expect(icdChronicity('V00.01XA')).toBe('undetermined')
  })

  it('does not guess for a code CCIR cannot place', () => {
    expect(icdChronicity('')).toBe('undetermined')
    expect(icdChronicity('門診追蹤')).toBe('undetermined')
  })

  it('ships a generated table whose prefixes never overlap', () => {
    expect(CCIR_VERSION).toMatch(/^v\d{4}\.\d+$/)
    const all = Object.values(CCIR_PREFIXES).flatMap((list) => list.split(','))
    const set = new Set(all)
    expect(set.size).toBe(all.length)
    // A longest-prefix lookup must hit exactly one entry: no listed prefix is
    // the ancestor of another.
    for (const prefix of all) {
      for (let i = 1; i < prefix.length; i++) expect(set.has(prefix.slice(0, i))).toBe(false)
    }
  })
})
