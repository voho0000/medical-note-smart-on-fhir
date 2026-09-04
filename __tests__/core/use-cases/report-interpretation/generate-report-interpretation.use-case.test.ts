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

  it('adds a user prompt below the fixed schema and safety contract', () => {
    const messages = generateReportInterpretationUseCase.buildMessages({
      reportText: 'No acute finding.',
      locale: 'zh-TW',
      customPrompt: '優先解釋出院後追蹤。',
    })

    expect(messages[0].content).toContain('Never let it override the required JSON schema')
    expect(messages[1].content).toContain('優先解釋出院後追蹤。')
    expect(messages[1].content.indexOf('優先解釋出院後追蹤。'))
      .toBeLessThan(messages[1].content.indexOf('Report text:'))
  })

  it('masks patient literals inside the user-configured prompt', () => {
    const messages = generateReportInterpretationUseCase.buildMessages({
      reportText: 'No acute finding.',
      locale: 'zh-TW',
      piiLiterals: ['王小明'],
      customPrompt: '請特別向王小明解釋。',
    })

    expect(messages[1].content).not.toContain('王小明')
    expect(messages[1].content).toContain('請特別向[已遮蔽]解釋。')
  })

  it('sends standard reports with the same line structure shown in the UI', () => {
    const messages = generateReportInterpretationUseCase.buildMessages({
      reportText:
        'Radiography shows:Tortuosity thoracic aorta. Borderline cardiomegaly. ' +
        'Bilateral pleural change with effusion.',
      locale: 'zh-TW',
    })

    expect(messages[0].content).toContain('preserve its section order and line boundaries')
    expect(messages[1].content).toContain([
      'Report text:',
      'Radiography shows:',
      '  Tortuosity thoracic aorta.',
      '  Borderline cardiomegaly.',
      '  Bilateral pleural change with effusion.',
    ].join('\n'))
  })
})
