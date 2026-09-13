/**
 * Puts the physician's DP-01 answer into the profile the pack reads.
 *
 * The answer is a fact like any other, shaped the way `clinicCongestionExam`
 * is — a canonical term the pack matches on, dated, and labelled 「門診輸入」 so
 * the provenance travels with it wherever a card prints it. An LVEF the
 * physician typed off an outside report is written as an `LVEF` fact too, so
 * every module that reads an ejection fraction recomputes from it rather than
 * only the phenotype card.
 *
 * Nothing here judges. Which phenotype the answer implies, and whether a
 * recorded value below 50% outranks a 「未曾 <50%」 answer, are the pack's to
 * decide.
 */
import {
  PHYSICIAN_HF_SUSPICION_TERMS,
  PHYSICIAN_LVEF_PHENOTYPE_TERMS,
} from '../physician-input-contract'
import type { CdssFreshnessContext, CdssPatientProfile } from '../types'
import type { PhenotypeAnswer } from '../stores/phenotype-answer.store'
import { CLINIC_ENTRY_NOTE } from './apply-clinic-vitals'

/**
 * The window an echocardiographic value is labelled against, matching the
 * pack's `ECHO_EVIDENCE_FRESH_DAYS`. Used only where the record carried no
 * window of its own for the LVEF, and only to label — never to withhold.
 */
const ECHO_WINDOW_DAYS = 365

function ageInDays(date: string, evaluatedAt: string | undefined): number | undefined {
  const at = Date.parse(date)
  const now = evaluatedAt ? Date.parse(evaluatedAt) : Date.now()
  if (Number.isNaN(at) || Number.isNaN(now)) return undefined
  return Math.max(0, Math.floor((now - at) / 86_400_000))
}

function isFiniteLvef(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 100
}

export function applyPhenotypeAnswer(
  profile: CdssPatientProfile,
  answer: PhenotypeAnswer | undefined,
): CdssPatientProfile {
  if (!answer) return profile

  const answeredOn = answer.answeredOn
  const facts: Record<string, CdssPatientProfile['facts'][string]> = {}

  // DP-00. Written only once someone has answered: an absent fact is what the
  // pack reads as 「還沒問」, and it never reads that as 「不懷疑」.
  if (answer.hfSuspicion) {
    facts.physicianHeartFailureSuspicion = {
      zh: `心衰竭懷疑（${answeredOn} ${CLINIC_ENTRY_NOTE.zh}）`,
      en: `Heart-failure suspicion (${answeredOn}, ${CLINIC_ENTRY_NOTE.en})`,
      date: answeredOn,
      textEvidence: {
        direction: answer.hfSuspicion === 'suspected' ? 'supports' : 'against',
        matchedTerms: [PHYSICIAN_HF_SUSPICION_TERMS[answer.hfSuspicion]],
      },
    }
  }

  if (answer.choice) {
    facts.physicianLvefPhenotype = {
      zh: `LVEF 分型（${answeredOn} ${CLINIC_ENTRY_NOTE.zh}）`,
      en: `LVEF phenotype (${answeredOn}, ${CLINIC_ENTRY_NOTE.en})`,
      date: answeredOn,
      ...(isFiniteLvef(answer.lvef) ? { numericValue: answer.lvef } : {}),
      textEvidence: {
        direction: 'supports',
        matchedTerms: [PHYSICIAN_LVEF_PHENOTYPE_TERMS[answer.choice]],
      },
    }
  }

  // 「不清楚」 states nothing about the ejection fraction, so no value travels
  // with it even if one was typed before the choice was changed.
  const lvef = answer.choice === 'unknown' ? undefined : answer.lvef
  const measuredOn = answer.measuredOn ?? answeredOn
  if (isFiniteLvef(lvef)) {
    facts.LVEF = {
      zh: `${lvef}%（${measuredOn} ${CLINIC_ENTRY_NOTE.zh}）`,
      en: `${lvef}% (${measuredOn}, ${CLINIC_ENTRY_NOTE.en})`,
      numericValue: lvef,
      unit: '%',
      date: measuredOn,
    }
  }

  // Only 「確認」 writes a fact. 「暫不確認」 is an answered question with no
  // finding in it: the clinician has seen the criteria and is not concluding
  // today, which the pack must not read as a refutation.
  if (answer.hfpEfConfirmed === true) {
    facts.physicianConfirmedHfpEf = {
      zh: `HFpEF 診斷已由醫師確認（${answeredOn} ${CLINIC_ENTRY_NOTE.zh}）`,
      en: `The HFpEF diagnosis was confirmed by the clinician (${answeredOn}, ${CLINIC_ENTRY_NOTE.en})`,
      date: answeredOn,
    }
  }

  // An answer that says nothing yet — the physician opened the control and
  // changed nothing — leaves the profile as the record wrote it.
  if (Object.keys(facts).length === 0) return profile

  const freshnessContexts = { ...(profile.freshnessContexts ?? {}) }
  if (facts.LVEF) {
    const existing = freshnessContexts.LVEF
    const intervalDays = existing?.intervalDays ?? ECHO_WINDOW_DAYS
    const age = ageInDays(measuredOn, profile.evaluatedAt)
    const context: CdssFreshnessContext = {
      factKey: 'LVEF',
      date: measuredOn,
      ...(age === undefined ? {} : { ageDays: age }),
      intervalDays,
      // A study from three years ago is still the study the physician is
      // reading; the state labels its age and never withholds the value.
      state: age !== undefined && age > intervalDays ? 'overdue' : 'current',
    }
    freshnessContexts.LVEF = context
  }

  return {
    ...profile,
    facts: { ...profile.facts, ...facts },
    freshnessContexts,
  }
}
