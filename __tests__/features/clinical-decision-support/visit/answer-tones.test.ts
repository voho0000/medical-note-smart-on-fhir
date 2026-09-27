import { answerToneClass, visitAnswerTone } from '@/features/clinical-decision-support/renderers/visit/answer-tones'

/**
 * A chosen every-visit answer wears the page's selection blue, unless the
 * answer is itself a clinical state: red for a warning, green for an
 * improvement (clinician feedback 2026-09-28: 「進步不是要綠色嗎」).
 */
describe('answer tones', () => {
  const chosen = (id: Parameters<typeof visitAnswerTone>[0], value: string) => answerToneClass(visitAnswerTone(id, value), true)

  it('greens 喘進步, reds 喘變差 and 體重增加, and keeps the rest in the selection blue', () => {
    expect(chosen('dyspnoea-trend', 'better')).toContain('bg-emerald-50')
    expect(chosen('dyspnoea-trend', 'worse')).toContain('bg-destructive/10')
    expect(chosen('weight-trend', 'up')).toContain('bg-destructive/10')
    for (const [id, value] of [['dyspnoea-trend', 'stable'], ['weight-trend', 'same'], ['weight-trend', 'down']] as const) {
      expect(chosen(id, value)).toContain('bg-primary/10')
    }
  })

  it('leaves every answer alike until one is chosen', () => {
    const open = new Set(['better', 'worse', 'stable'].map((value) => answerToneClass(visitAnswerTone('dyspnoea-trend', value), false)))
    expect(open.size).toBe(1)
  })
})
