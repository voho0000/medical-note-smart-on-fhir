// Custom Hook: Orphan Observations Processing
import { useMemo } from 'react'
import type { Observation, Row } from '../types'
import { getCodeableConceptText, formatDate } from '../utils/fhir-helpers'
import { inferGroupFromObservation } from '../utils/grouping-helpers'
import { getAnalyteLabel } from '@/src/shared/utils/lab-normalize'

export function useOrphanObservations(observations: any[], seenIds: Set<string>) {
  return useMemo(() => {
    if (!Array.isArray(observations)) return []

    const orphan = observations.filter((o) => (!o.id || !seenIds.has(o.id))) as Observation[]

    const panels = orphan.filter((o) =>
      (Array.isArray(o.component) && o.component.length > 0) ||
      (Array.isArray(o.hasMember) && o.hasMember.length > 0) ||
      !!o.valueQuantity ||
      !!o.valueString
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
        // Use the canonical analyte label so orphan rows show the same English
        // short code (Na / K / BUN / LACTATE …) as DR-attached lab rows.
        // Falls back to raw text for non-analyte orphans (e.g. cultures).
        title: getAnalyteLabel(first),
        meta: `Observation Group`,
        obs: lst,
        group: inferGroupFromObservation(first),
        institution,
        effectiveDate: first.effectiveDateTime,
      }
    })
  }, [observations, seenIds])
}
