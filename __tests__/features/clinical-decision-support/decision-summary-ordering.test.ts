import { CARE_PACKS, type CdssPatientProfile } from '@voho0000/personalized-care'
import { buildClinicalDecisionSummary } from '@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView'

/**
 * The focus summary shows three cards. Which three is a clinical question, and
 * priority alone cannot answer it: a pack that applies the time-to-harm rule
 * honestly leaves nearly everything at `medium`, so sorting by priority is a
 * no-op and the slots fall to build order. This pins the rule that an item the
 * pack marked actionable outranks one it marked review.
 */

const CKD_PACK = CARE_PACKS.find((candidate) => candidate.id === 'ckd-cdss')!

function fact(value: number) {
  return { zh: String(value), en: String(value), numericValue: value, date: '2026-07-01' }
}

/** G3b A2, on no kidney-protective agent: three prescribing actions are open. */
const profile = {
  id: 'summary-ordering',
  evaluatedAt: '2026-08-01',
  demographics: { sex: 'female' },
  eligibleDiseasePackIds: ['ckd-poc'],
  facts: {
    age: fact(68),
    eGFR: fact(38),
    urineAlbuminRatioQuantitative: fact(180),
    bloodPressure: {
      zh: '148/86',
      en: '148/86',
      date: '2026-07-01',
      sources: [{ value: '148/86', unit: 'mmHg', date: '2026-07-01' }],
    },
    potassium: fact(5.2),
    hemoglobin: fact(10.8),
    serumCreatinine: fact(1.4),
  },
  freshnessContexts: {
    eGFR: { state: 'current' },
    quantitativeUacr: { state: 'current' },
    bloodPressure: { state: 'current' },
  },
} as unknown as CdssPatientProfile

describe('clinical decision summary ordering', () => {
  const result = CKD_PACK.build({ profile, locale: 'zh-TW' })
  const summary = buildClinicalDecisionSummary(result, 'zh-TW')

  it('gives the focus slots to actionable cards before review cards', () => {
    const shown = summary.actionRecommendations.map((item) => item.status)
    expect(shown).toEqual(['actionable', 'actionable', 'actionable'])
  })

  it('drops no actionable card while a review card holds a slot', () => {
    const actionable = result.recommendations.filter((item) => item.status === 'actionable')
    const shownIds = new Set(summary.actionRecommendations.map((item) => item.id))
    const droppedActionable = actionable.filter((item) => !shownIds.has(item.id))
    const shownReview = summary.actionRecommendations.filter((item) => item.status === 'review')

    // This patient has exactly three, which is the summary limit; a fourth
    // would legitimately not fit, but never behind a review card.
    expect(actionable.length).toBe(3)
    expect(droppedActionable.length === 0 || shownReview.length === 0).toBe(true)
  })

  it('still ranks a high-priority card above the rest of its own status', () => {
    const ordered = [
      { status: 'actionable', priority: 'medium', id: 'b' },
      { status: 'actionable', priority: 'high', id: 'a' },
      { status: 'review', priority: 'high', id: 'c' },
    ] as unknown as typeof result.recommendations
    const ranked = buildClinicalDecisionSummary(
      { ...result, recommendations: ordered },
      'zh-TW',
    ).actionRecommendations.map((item) => item.id)

    expect(ranked).toEqual(['a', 'b', 'c'])
  })
})
