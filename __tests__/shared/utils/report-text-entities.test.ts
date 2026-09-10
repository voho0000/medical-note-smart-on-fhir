import { decodeReportEntities, formatReportText } from '@/src/shared/utils/report-text-format'

describe('decodeReportEntities', () => {
  it('decodes the escaping bridge captures leave in report bodies', () => {
    expect(decodeReportEntities("XLE05L&apos;t knee")).toBe("XLE05L't knee")
    expect(decodeReportEntities('LA 4.8 cm&quot;')).toBe('LA 4.8 cm"')
    expect(decodeReportEntities('EF &lt; 40%')).toBe('EF < 40%')
    expect(decodeReportEntities('EF &gt; 55%')).toBe('EF > 55%')
    expect(decodeReportEntities('&#39;t knee')).toBe("'t knee")
    expect(decodeReportEntities('&#x27;t knee')).toBe("'t knee")
  })

  it('leaves a bare ampersand in clinical text alone', () => {
    // Real report titles contain these; they are not entities.
    expect(decodeReportEntities('CT without&with contrast'))
      .toBe('CT without&with contrast')
    expect(decodeReportEntities('Pelvis & hip joint X-ray'))
      .toBe('Pelvis & hip joint X-ray')
  })

  it('decodes &amp; last, so an escaped ampersand stays a word', () => {
    // "&amp;apos;" is the source writing a literal "&apos;", not an apostrophe.
    expect(decodeReportEntities('&amp;apos;')).toBe('&apos;')
    expect(decodeReportEntities('A&amp;B')).toBe('A&B')
  })

  it('returns the input untouched when there is nothing to decode', () => {
    const plain = 'No evidence of bone fracture.'
    expect(decodeReportEntities(plain)).toBe(plain)
    expect(decodeReportEntities('')).toBe('')
  })

  it('reaches the rendered lines, not just the raw string', () => {
    const lines = formatReportText("XLE05L&apos;t knee\n=Osteoarthritis of left knee joint.")
    expect(lines.map((line) => line.text).join(' ')).toContain("L't knee")
    expect(lines.map((line) => line.text).join(' ')).not.toContain('&apos;')
  })
})
