import {
  generateReportInterpretationUseCase,
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

  it('masks patient literals in unlabeled report prose before clamping', () => {
    const prepared = prepareReportText('王小明右肺結節，建議追蹤。', 'standard', ['王小明'])
    expect(prepared.text).toBe('[已遮蔽]右肺結節，建議追蹤。')
  })

  it('masks patient literals in the report title at the final outbound boundary', () => {
    const messages = generateReportInterpretationUseCase.buildMessages({
      reportTitle: '王小明胸部 CT',
      reportText: 'No acute finding.',
      piiLiterals: ['王小明'],
      locale: 'zh-TW',
    })
    expect(messages[1].content).not.toContain('王小明')
    expect(messages[1].content).toContain('Report title: [已遮蔽]胸部 CT')
  })
})
