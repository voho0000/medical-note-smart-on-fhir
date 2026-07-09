import {
  LONG_DOCUMENT_INPUT_CHAR_CAP,
  REPORT_INPUT_CHAR_CAP,
  prepareReportText,
} from '@/src/core/use-cases/report-interpretation/generate-report-interpretation.use-case'

describe('prepareReportText', () => {
  it('keeps standard reports on the original leading-part clamp', () => {
    const text = `HEAD-${'a'.repeat(REPORT_INPUT_CHAR_CAP)}-TAIL`
    const prepared = prepareReportText(text, 'standard')

    expect(prepared.truncated).toBe(true)
    expect(prepared.coverage).toBe('partial')
    expect(prepared.mode).toBe('standard')
    expect(prepared.text.startsWith('HEAD-')).toBe(true)
    expect(prepared.text).not.toContain('-TAIL')
    expect(prepared.text.length).toBe(REPORT_INPUT_CHAR_CAP)
  })

  it('uses beginning and ending excerpts for long clinical documents', () => {
    const text = `HEAD-${'m'.repeat(LONG_DOCUMENT_INPUT_CHAR_CAP)}-TAIL`
    const prepared = prepareReportText(text, 'long-document')

    expect(prepared.truncated).toBe(true)
    expect(prepared.coverage).toBe('long-document-digest')
    expect(prepared.mode).toBe('long-document')
    expect(prepared.text.startsWith('HEAD-')).toBe(true)
    expect(prepared.text).toContain('-TAIL')
    expect(prepared.text).toContain('中間部分因文件過長未送入 AI')
    expect(prepared.text.length).toBeLessThanOrEqual(LONG_DOCUMENT_INPUT_CHAR_CAP)
  })

  it('does not mark complete long documents as digest-only', () => {
    const text = 'short discharge summary'
    const prepared = prepareReportText(text, 'long-document')

    expect(prepared).toEqual({
      text,
      truncated: false,
      coverage: 'full',
      mode: 'long-document',
    })
  })
})
