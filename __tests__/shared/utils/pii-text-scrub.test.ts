import { scrubFreeText, buildPatientTextLiterals } from '@/src/shared/utils/pii-text-scrub'

describe('scrubFreeText', () => {
  it('masks TW national IDs (身分證字號)', () => {
    expect(scrubFreeText('病患 A123456789 於本院住院')).toBe('病患 [已遮蔽] 於本院住院')
    expect(scrubFreeText('B234567890')).toBe('[已遮蔽]')
  })

  it('masks new-format resident IDs (居留證統一證號)', () => {
    expect(scrubFreeText('id: A812345678')).toBe('id: [已遮蔽]')
    expect(scrubFreeText('id: A912345678')).toBe('id: [已遮蔽]')
  })

  it('does NOT mask lab values, dates, or plain numbers', () => {
    const text = 'WBC 4180 /uL, Cr 1.2 mg/dL, 2025-11-20 採檢, HbA1c 7.2%'
    expect(scrubFreeText(text)).toBe(text)
  })

  it('does NOT mask ID-like strings embedded in longer tokens', () => {
    // 9 digits after the letter (not 8) — not a valid ID shape
    expect(scrubFreeText('order A1234567890 shipped')).toBe('order A1234567890 shipped')
  })

  it('masks labeled chart numbers but keeps the label', () => {
    expect(scrubFreeText('病歷號：12345678 男性')).toBe('病歷號：[已遮蔽] 男性')
    expect(scrubFreeText('Chart No: AB-123456')).toBe('Chart No: [已遮蔽]')
    expect(scrubFreeText('MRN 87654321')).toBe('MRN [已遮蔽]')
  })

  it('masks labeled patient names but keeps the label', () => {
    expect(scrubFreeText('姓名：王小明 65歲男性')).toBe('姓名：[已遮蔽] 65歲男性')
    expect(scrubFreeText('Patient Name: Wang 65y')).toBe('Patient Name: [已遮蔽] 65y')
  })

  it('masks caller-provided patient literals wherever they appear', () => {
    const out = scrubFreeText('王小明先生因胸痛入院，王小明主訴…', ['王小明'])
    expect(out).toBe('[已遮蔽]先生因胸痛入院，[已遮蔽]主訴…')
  })

  it('leaves clinical narrative untouched', () => {
    const text =
      'CT abdomen: fatty liver, gallbladder sludge. 建議追蹤。Impression: r/o HCC, ' +
      'S/P PCI 2023, EF 45%, NYHA Fc II'
    expect(scrubFreeText(text)).toBe(text)
  })

  it('handles empty / falsy input', () => {
    expect(scrubFreeText('')).toBe('')
  })
})

describe('buildPatientTextLiterals', () => {
  it('collects FHIR name.text, family+given (CJK joined), and identifiers', () => {
    const literals = buildPatientTextLiterals({
      id: 'patient-1',
      name: [{ text: '王小明', family: '王', given: ['小明'] }],
      identifier: [{ value: 'A123456789' }],
    })
    expect(literals).toContain('王小明')
    expect(literals).toContain('A123456789')
    expect(literals).toContain('patient-1')
  })

  it('drops too-short literals that would mass-mask clinical text', () => {
    const literals = buildPatientTextLiterals({
      id: '12',
      name: [{ family: '王', given: [] }],
    })
    expect(literals).not.toContain('王')
    expect(literals).not.toContain('12')
  })

  it('returns [] for null / non-object input', () => {
    expect(buildPatientTextLiterals(null)).toEqual([])
    expect(buildPatientTextLiterals(undefined)).toEqual([])
    expect(buildPatientTextLiterals('x')).toEqual([])
  })
})
