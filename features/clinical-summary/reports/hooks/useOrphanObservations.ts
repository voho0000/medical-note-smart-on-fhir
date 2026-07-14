// Custom Hook: Orphan Observations Processing
import { useMemo } from 'react'
import type { Observation } from '../types'
import { getCodeableConceptText } from '../utils/fhir-helpers'
import { inferGroupFromObservation } from '../utils/grouping-helpers'
import { getAnalyteDisplayForMode, type AnalyteNameMode } from '@/src/shared/utils/lab-normalize'
import { useAudience } from '@/src/application/providers/audience.provider'
import { useLanguage } from '@/src/application/providers/language.provider'

export function useOrphanObservations(
  observations: any[],
  seenIds: Set<string>,
  nameMode: AnalyteNameMode = 'standardized',
) {
  const { audience } = useAudience()
  const { locale } = useLanguage()
  return useMemo(() => {
    if (!Array.isArray(observations)) return []

    const orphan = observations.filter((o) => (!o.id || !seenIds.has(o.id))) as Observation[]

    const panels = orphan.filter((o) =>
      (Array.isArray(o.component) && o.component.length > 0) ||
      (Array.isArray(o.hasMember) && o.hasMember.length > 0) ||
      !!o.valueQuantity ||
      !!o.valueString ||
      // Coded-only results (valueCodeableConcept — e.g. blood type, mCODE tumour
      // markers) deserve a row too, not just numeric/string values.
      !!o.valueCodeableConcept
    )

    // Group by encounter + date + raw code.text. We use the raw text (not the
    // canonical label) for the group KEY so two orphan obs that happen to map
    // to the same canonical analyte but came from different source labels
    // stay distinct — same defensive position as the cumulative-report
    // grouping. Only the DISPLAYED title is canonicalised.
    const groupKey = (o: Observation) =>
      (o.encounter?.reference || "") +
      "|" +
      (o.effectiveDateTime ? new Date(o.effectiveDateTime).toISOString().slice(0, 10) : "unknown") +
      "|" +
      (getCodeableConceptText(o.code) || "Observation")

    const groups = new Map<string, Observation[]>()
    for (const o of panels) {
      const k = groupKey(o)
      const arr = groups.get(k) || []
      arr.push(o)
      groups.set(k, arr)
    }

    return Array.from(groups.entries()).map(([k, lst]) => {
      const first = lst[0]
      const institution = (first as any).performer?.[0]?.display
      return {
        id: `orphan:${k}`,
        // Audience-aware analyte label so orphan rows match DR-attached
        // rows. Medical → canonical short code (Na / K / BUN / …); patient
        // → long-form translation in the active UI language. Non-canonical
        // orphans (cultures, free-text obs) keep their bridge-sent label.
        title: getAnalyteDisplayForMode(first, audience, locale, nameMode),
        meta: `Observation Group`,
        obs: lst,
        group: inferGroupFromObservation(first),
        institution,
        effectiveDate: first.effectiveDateTime,
      }
    })
  }, [observations, seenIds, audience, locale, nameMode])
}
