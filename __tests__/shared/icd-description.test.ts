import { stripLeadingIcdCode } from '@/src/shared/utils/icd-lookup'

describe('ICD description prefix deduplication', () => {
  it.each(['S72002A', 'S72.002A', 's72002a'])(
    'removes matching alphanumeric prefix %s while retaining the diagnosis',
    (prefix) => {
      expect(stripLeadingIcdCode(`${prefix} 左側股骨頸骨折之初期照護`, 'S72.002A'))
        .toBe('左側股骨頸骨折之初期照護')
    },
  )

  it('does not remove a different encounter suffix or a longer code', () => {
    expect(stripLeadingIcdCode('S72002D 後續照護', 'S72.002A')).toBe('S72002D 後續照護')
    expect(stripLeadingIcdCode('F33421 description', 'F33.42')).toBe('F33421 description')
  })

  it('preserves plain descriptions and text without a separate code', () => {
    expect(stripLeadingIcdCode('Fracture of left femoral neck', 'S72.002A'))
      .toBe('Fracture of left femoral neck')
    expect(stripLeadingIcdCode('S72002A 左側股骨頸骨折', ''))
      .toBe('S72002A 左側股骨頸骨折')
  })

  it('does not repeat a code-only description or invent missing text', () => {
    expect(stripLeadingIcdCode('S72002A', 'S72.002A')).toBeUndefined()
    expect(stripLeadingIcdCode(undefined, 'S72.002A')).toBeUndefined()
  })
})
