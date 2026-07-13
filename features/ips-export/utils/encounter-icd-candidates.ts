// IPS Phase 2.2 — deterministic (no-AI) import of recent visit ICD-10 codes as
// problem-list REVIEW CANDIDATES.
//
// POLICY: the problem list holds 重大傷病 only. Encounter.reasonCode ICD-10 codes
// are BILLING codes — often entered to justify a prescription or a lab order, not
// a confirmed diagnosis. So these candidates are:
//   - imported deterministically (real source codes, NO AI, NO invented codes),
//   - surfaced with an explicit 「非確診」/"Unconfirmed" flag,
//   - default UNCHECKED — nothing reaches the export until the clinician confirms
//     it through the SAME per-item gate every other candidate goes through.
// The genuine ICD-10 coding rides along (sourceCoding) so a confirmed candidate
// exports with its real code — this is a real source code, not a guessed one.

import type {
  ConditionEntity,
  EncounterEntity,
} from '@/src/core/entities/clinical-data.entity'
import { buildIcdDictionary, extractEncounterIcds } from '@/src/shared/utils/icd-lookup'
import { SYSTEM } from './ips-constants'
import type { InferredProblem } from './inferred-problems-types'

export interface BuildEncounterIcdCandidatesOptions {
  /** Recency window in months (default 6). Encounters older than this are dropped. */
  sinceMonths?: number
  /** UI locale — decides which description language wins in the evidence label. */
  locale?: string
  /** Injectable clock for deterministic window tests (defaults to wall-clock). */
  now?: Date
}

/** Per-code accumulator while aggregating one ICD across multiple visits. */
interface IcdAccumulator {
  code: string
  descZh?: string
  descEn?: string
  system?: string
  display?: string
  count: number
  firstDate?: string
  lastDate?: string
}

/**
 * Map an Encounter's reasonCode entries to the genuine source coding keyed by
 * ICD-10 code. Mirrors extractEncounterIcds' "primary coding" pick so the coding
 * lines up with the code it resolves. OLD comma-separated-text encounters carry
 * no coding, so their codes simply won't appear here (system falls back later).
 */
function collectSourceCodings(
  enc: EncounterEntity,
): Map<string, { system?: string; display?: string }> {
  const out = new Map<string, { system?: string; display?: string }>()
  for (const rc of enc.reasonCode ?? []) {
    const coding = Array.isArray(rc?.coding) ? rc.coding : []
    const primary = coding.find((c) => c?.code) ?? coding[0]
    const code = primary?.code
    if (code && !out.has(code)) {
      out.set(code, { system: primary?.system, display: primary?.display })
    }
  }
  return out
}

/**
 * Build recent-visit ICD-10 review candidates. Pure & deterministic.
 *
 *  - Keeps encounters whose `period.start` is within `sinceMonths` of `now`.
 *  - Aggregates by ICD code across visits: one candidate per distinct code with
 *    the cumulative visit count and the first/last visit dates.
 *  - Emits `origin:'encounter-icd'`, `inferenceConfidence:'low'` (the UI does not
 *    render a confidence badge for this origin — confidence is meaningless for a
 *    raw source code), the real `sourceCoding`, and one `encounter-icd` evidence
 *    row carrying the visit count + latest date.
 *  - Sorted by visit count desc, then most-recent date.
 */
export function buildEncounterIcdCandidates(
  encounters: EncounterEntity[],
  conditions: ConditionEntity[],
  options: BuildEncounterIcdCandidatesOptions = {},
): InferredProblem[] {
  const { sinceMonths = 6, locale = 'zh-TW', now = new Date() } = options
  const cutoff = new Date(now)
  cutoff.setMonth(cutoff.getMonth() - sinceMonths)
  const cutoffMs = cutoff.getTime()

  // Bundle Conditions can carry richer bilingual descriptions than the raw
  // reasonCode text — resolve both languages independently of UI locale.
  const dictZh = buildIcdDictionary(conditions ?? [], 'zh-TW')
  const dictEn = buildIcdDictionary(conditions ?? [], 'en')

  const map = new Map<string, IcdAccumulator>()

  for (const enc of encounters ?? []) {
    const start = enc.period?.start
    if (!start) continue
    const startMs = new Date(start).getTime()
    if (Number.isNaN(startMs) || startMs < cutoffMs) continue

    const zhHits = extractEncounterIcds(enc, dictZh, 'zh-TW')
    const enHits = extractEncounterIcds(enc, dictEn, 'en')
    const enByCode = new Map(enHits.map((h) => [h.code, h.description]))
    const codings = collectSourceCodings(enc)

    for (const hit of zhHits) {
      const acc = map.get(hit.code) ?? { code: hit.code, count: 0 }
      acc.count += 1
      if (!acc.descZh && hit.description) acc.descZh = hit.description
      const enDesc = enByCode.get(hit.code)
      if (!acc.descEn && enDesc) acc.descEn = enDesc
      const coding = codings.get(hit.code)
      if (!acc.system && coding?.system) acc.system = coding.system
      if (!acc.display && coding?.display) acc.display = coding.display
      if (!acc.firstDate || start < acc.firstDate) acc.firstDate = start
      if (!acc.lastDate || start > acc.lastDate) acc.lastDate = start
      map.set(hit.code, acc)
    }
  }

  return [...map.values()]
    .sort(
      (a, b) => b.count - a.count || (b.lastDate ?? '').localeCompare(a.lastDate ?? ''),
    )
    .map((acc): InferredProblem => {
      const labelZh = acc.descZh || acc.code
      const labelEn = acc.descEn || acc.descZh || acc.code
      const evidenceLabel =
        (locale === 'en' ? acc.descEn || acc.descZh : acc.descZh || acc.descEn) || acc.code
      const display = acc.descEn || acc.display || acc.descZh || undefined
      return {
        id: `encounter-icd:${acc.code}`,
        labelZh,
        labelEn,
        inferenceConfidence: 'low',
        origin: 'encounter-icd',
        // Real source code — system faithful to the bundle, ICD-10 as fallback
        // only when an OLD text-only encounter carried no coding.system.
        sourceCoding: {
          system: acc.system || SYSTEM.icd10,
          code: acc.code,
          ...(display ? { display } : {}),
        },
        evidence: [
          {
            kind: 'encounter-icd',
            label: evidenceLabel,
            icd10: acc.code,
            count: acc.count,
            date: acc.lastDate,
          },
        ],
      }
    })
}
