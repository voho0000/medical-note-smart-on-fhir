import { applyPhenotypeAnswer } from '@/features/clinical-decision-support/utils/apply-phenotype-answer'
import {
  PHYSICIAN_HF_SUSPICION_TERMS,
  PHYSICIAN_LVEF_PHENOTYPE_TERMS,
} from '@/features/clinical-decision-support/physician-input-contract'
import type { CdssPatientProfile } from '@/features/clinical-decision-support/types'

/**
 * DP-01: the physician's answer reaches the pack as facts, never as a patch.
 *
 * 健保雲端 holds no ejection fraction for a patient whose only echocardiogram
 * was done elsewhere, and both ESC 2026 phenotypes start from one. The 01 card
 * asks; this is the step that turns the answer into something the pack reads.
 */

const profile: CdssPatientProfile = {
  id: 'p1',
  evaluatedAt: '2026-09-09T00:00:00+08:00',
  facts: {
    potassium: { zh: '4.2 mmol/L', en: '4.2 mmol/L', numericValue: 4.2, date: '2026-07-06' },
  },
}

describe('applyPhenotypeAnswer', () => {
  it('returns the profile untouched when nothing has been answered', () => {
    expect(applyPhenotypeAnswer(profile, undefined)).toBe(profile)
    expect(applyPhenotypeAnswer(profile, { answeredOn: '2026-09-09' })).toBe(profile)
  })

  it('writes the answer as a term the pack matches on, marked as entered in clinic', () => {
    const next = applyPhenotypeAnswer(profile, {
      choice: 'reduced',
      answeredOn: '2026-09-09',
    })

    expect(next.facts.physicianLvefPhenotype?.textEvidence?.matchedTerms)
      .toEqual([PHYSICIAN_LVEF_PHENOTYPE_TERMS.reduced])
    expect(next.facts.physicianLvefPhenotype?.zh).toContain('門診輸入')
    // No value was typed, so none is invented.
    expect(next.facts.LVEF).toBeUndefined()
    // The record's own facts are left as they were.
    expect(next.facts.potassium).toBe(profile.facts.potassium)
  })

  it('writes a typed LVEF as an LVEF fact, dated by the study rather than by today', () => {
    const next = applyPhenotypeAnswer(profile, {
      choice: 'preserved',
      lvef: 58,
      measuredOn: '2026-03-01',
      answeredOn: '2026-09-09',
    })

    expect(next.facts.LVEF).toMatchObject({ numericValue: 58, unit: '%', date: '2026-03-01' })
    expect(next.facts.LVEF?.zh).toContain('門診輸入')
    // Six months old against the 365-day echo window, so still current and
    // labelled by its own date rather than by the day it was typed.
    expect(next.freshnessContexts?.LVEF).toMatchObject({
      factKey: 'LVEF',
      date: '2026-03-01',
      intervalDays: 365,
      state: 'current',
    })
    expect(next.freshnessContexts?.LVEF?.ageDays).toBeGreaterThan(180)
  })

  it('labels a study older than the echo window as overdue without withholding it', () => {
    const next = applyPhenotypeAnswer(profile, {
      choice: 'preserved',
      lvef: 58,
      measuredOn: '2021-01-05',
      answeredOn: '2026-09-09',
    })

    expect(next.facts.LVEF?.numericValue).toBe(58)
    expect(next.freshnessContexts?.LVEF?.state).toBe('overdue')
  })

  it('carries no value with 「不清楚」, which states nothing about the ejection fraction', () => {
    const next = applyPhenotypeAnswer(profile, {
      choice: 'unknown',
      // Left over from a choice the physician changed away from.
      lvef: 58,
      measuredOn: '2026-03-01',
      answeredOn: '2026-09-09',
    })

    expect(next.facts.physicianLvefPhenotype?.textEvidence?.matchedTerms)
      .toEqual([PHYSICIAN_LVEF_PHENOTYPE_TERMS.unknown])
    expect(next.facts.LVEF).toBeUndefined()
  })

  it('writes the suspicion as its own term, and only once someone has answered', () => {
    const suspected = applyPhenotypeAnswer(profile, {
      hfSuspicion: 'suspected',
      answeredOn: '2026-09-09',
    })
    const notSuspected = applyPhenotypeAnswer(profile, {
      hfSuspicion: 'not-suspected',
      answeredOn: '2026-09-09',
    })

    expect(suspected.facts.physicianHeartFailureSuspicion?.textEvidence)
      .toMatchObject({ direction: 'supports', matchedTerms: [PHYSICIAN_HF_SUSPICION_TERMS.suspected] })
    expect(notSuspected.facts.physicianHeartFailureSuspicion?.textEvidence)
      .toMatchObject({ direction: 'against', matchedTerms: [PHYSICIAN_HF_SUSPICION_TERMS['not-suspected']] })
    // An answer nobody has given leaves the fact absent, which is what the pack
    // reads as 「還沒問」 rather than as 「不懷疑」.
    expect(applyPhenotypeAnswer(profile, { answeredOn: '2026-09-09' }))
      .toBe(profile)
  })

  it('writes the HFpEF confirmation on its own, without a phenotype answer', () => {
    const next = applyPhenotypeAnswer(profile, {
      hfpEfConfirmed: true,
      answeredOn: '2026-09-09',
    })

    expect(next.facts.physicianConfirmedHfpEf?.zh).toContain('醫師確認')
    expect(next.facts.physicianLvefPhenotype).toBeUndefined()
  })

  it('writes nothing for 「暫不確認」, which is an answer with no finding in it', () => {
    // The question was put and the clinician is not concluding today. The pack
    // must read that as unknown — not as a refutation of HFpEF.
    expect(applyPhenotypeAnswer(profile, {
      hfpEfConfirmed: 'not-assessed',
      answeredOn: '2026-09-09',
    })).toBe(profile)
  })
})
