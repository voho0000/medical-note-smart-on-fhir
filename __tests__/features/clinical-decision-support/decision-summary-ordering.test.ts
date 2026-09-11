import { CARE_PACKS, type CdssPatientProfile } from '@voho0000/personalized-care'
import { buildClinicalDecisionSummary } from '@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView'

/**
 * The focus summary shows three cards. Which three is a clinical question, and
 * priority alone cannot answer it: a pack that applies the time-to-harm rule
 * honestly leaves nearly everything at `medium`, so sorting by priority is a
 * no-op and the slots fall to build order. This pins the rule that an item the
 * pack marked actionable outranks one it marked review.
 *
 * The pack is only the fixture — the rule under test is the host's ordering.
 * Heart failure is what the package ships, so it is what the real output comes
 * from.
 */

const HEART_FAILURE_PACK = CARE_PACKS.find((candidate) => candidate.id === 'heart-failure-cdss')!

function fact(value: number) {
  return { zh: String(value), en: String(value), numericValue: value, date: '2026-07-01' }
}

/** HFrEF on none of the four FMT pillars: several prescribing actions are open. */
const profile = {
  id: 'summary-ordering',
  evaluatedAt: '2026-08-01',
  demographics: { sex: 'female' },
  eligibleDiseasePackIds: ['heart-failure-poc'],
  facts: {
    age: fact(68),
    LVEF: fact(32),
    eGFR: fact(48),
    potassium: fact(4.6),
    sodium: fact(138),
    heartRate: fact(78),
    bodyWeight: fact(74.5),
    bloodPressure: {
      zh: '118/72',
      en: '118/72',
      date: '2026-07-01',
      sources: [{ value: '118/72', unit: 'mmHg', date: '2026-07-01' }],
    },
    heartFailureDiagnosis: { zh: 'I50.22', en: 'I50.22', date: '2026-07-01' },
  },
  freshnessContexts: {
    LVEF: { state: 'current' },
    eGFR: { state: 'current' },
    bloodPressure: { state: 'current' },
  },
} as unknown as CdssPatientProfile

describe('clinical decision summary ordering', () => {
  const result = HEART_FAILURE_PACK.build({ profile, locale: 'zh-TW' })
  const summary = buildClinicalDecisionSummary(result, 'zh-TW')

  it('lists every actionable card before any review card', () => {
    const statuses = summary.actionRecommendations.map((item) => item.status)
    const lastActionable = statuses.lastIndexOf('actionable')
    const firstReview = statuses.indexOf('review')

    expect(statuses).toContain('actionable')
    expect(statuses).toContain('review')
    expect(firstReview).toBeGreaterThan(lastActionable)
  })

  it('drops nothing — the card consolidates the whole run, it does not rank a top three', () => {
    const eligible = result.recommendations.filter(
      (item) => item.status === 'actionable' || item.status === 'review',
    )
    const shownIds = new Set(summary.actionRecommendations.map((item) => item.id))

    expect(eligible.length).toBeGreaterThan(3)
    expect(eligible.every((item) => shownIds.has(item.id))).toBe(true)
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
