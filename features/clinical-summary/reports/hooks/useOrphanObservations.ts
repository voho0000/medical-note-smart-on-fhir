// Custom Hook: Orphan Observations Processing
import { useMemo } from 'react'
import type { Observation, Row } from '../types'
import { getCodeableConceptText, formatDate } from '../utils/fhir-helpers'
import { inferGroupFromObservation } from '../utils/grouping-helpers'

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
      return {
        id: `orphan:${k}`,
        title: getCodeableConceptText(first.code),
        meta: `Observation Group • ${formatDate(first.effectiveDateTime)}`,
        obs: lst,
        group: inferGroupFromObservation(first)
      }
    })
  }, [observations, seenIds])
}
