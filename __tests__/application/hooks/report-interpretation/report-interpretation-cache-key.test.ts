import { buildReportInterpretationCompositeKey } from '@/src/application/hooks/report-interpretation/report-interpretation-cache-key'

describe('buildReportInterpretationCompositeKey', () => {
  it('reuses one key for the same prepared text across different UI hosts', () => {
    const first = buildReportInterpretationCompositeKey({
      mode: 'standard',
      audience: 'patient',
      locale: 'zh-TW',
      preparedText: 'Chest CT report narrative',
    })
    const second = buildReportInterpretationCompositeKey({
      mode: 'standard',
      audience: 'patient',
      locale: 'zh-TW',
      preparedText: 'Chest CT report narrative',
    })

    expect(first).toBe(second)
  })

  it('separates different text and interpretation modes', () => {
    const base = buildReportInterpretationCompositeKey({
      mode: 'standard',
      audience: 'patient',
      locale: 'zh-TW',
      preparedText: 'same text',
    })
    const differentText = buildReportInterpretationCompositeKey({
      mode: 'standard',
      audience: 'patient',
      locale: 'zh-TW',
      preparedText: 'changed text',
    })
    const differentMode = buildReportInterpretationCompositeKey({
      mode: 'long-document',
      audience: 'patient',
      locale: 'zh-TW',
      preparedText: 'same text',
    })

    expect(base).not.toBe(differentText)
    expect(base).not.toBe(differentMode)
  })
})
