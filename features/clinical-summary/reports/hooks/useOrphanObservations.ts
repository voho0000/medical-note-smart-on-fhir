// Custom Hook: Orphan Observations Processing
import { useMemo } from 'react'
import type { Observation } from '../types'
import { getCodeableConceptText } from '../utils/fhir-helpers'
import { inferGroupFromObservation } from '../utils/grouping-helpers'
import { getAnalyteDisplayForMode, type AnalyteNameMode } from '@voho0000/clinical-lab-normalization/display'
import { useAudience } from '@/src/application/providers/audience.provider'
import { useLanguage } from '@/src/application/providers/language.provider'
import { stripHtmlToText } from '@/src/core/utils/clinical-documents.utils'
import { isAdultPreventiveHealthExamResource } from '@/src/shared/utils/observation-provenance.utils'
import { referenceId } from '@/src/core/utils/observation-selectors'
import { isPreventiveMedicineComposition } from '@/features/clinical-summary/document-summary/utils/loinc-document-types'

type CompositionSectionLike = {
  entry?: Array<{ reference?: string }>
  section?: CompositionSectionLike[]
}

function collectAdultPreventiveObservationIds(compositions: any[]): Set<string> {
  const ids = new Set<string>()

  const visitSection = (section: CompositionSectionLike) => {
    for (const entry of section.entry ?? []) {
      const id = referenceId(entry.reference)
      if (id) ids.add(id)
    }
    for (const child of section.section ?? []) visitSection(child)
  }

  for (const composition of compositions) {
    if (!isPreventiveMedicineComposition(composition)
      && !isAdultPreventiveHealthExamResource(composition)) continue
    for (const section of composition.section ?? []) visitSection(section)
  }

  return ids
}

export function useOrphanObservations(
  observations: any[],
  seenIds: Set<string>,
  nameMode: AnalyteNameMode = 'standardized',
  compositions: any[] = [],
) {
  const { audience } = useAudience()
  const { locale, t } = useLanguage()
  return useMemo(() => {
    if (!Array.isArray(observations)) return []

    const adultPreventiveObservationIds = collectAdultPreventiveObservationIds(
      Array.isArray(compositions) ? compositions : [],
    )
    const isAdultPreventiveObservation = (observation: Observation) =>
      isAdultPreventiveHealthExamResource(observation)
      || (!!observation.id && adultPreventiveObservationIds.has(observation.id))

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
      (getCodeableConceptText(o.code) || "Observation") +
      "|" +
      (isAdultPreventiveObservation(o) ? 'adult-preventive' : '')

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
      const group = inferGroupFromObservation(first)
      const displayObservations = group === 'cancer-screening'
        ? lst.map((observation) => ({
            ...observation,
            valueString: typeof observation.valueString === 'string'
              ? stripHtmlToText(observation.valueString)
              : observation.valueString,
          }))
        : lst
      return {
        id: `orphan:${k}`,
        // Audience-aware analyte label so orphan rows match DR-attached
        // rows. Medical → canonical short code (Na / K / BUN / …); patient
        // → long-form translation in the active UI language. Non-canonical
        // orphans (cultures, free-text obs) keep their bridge-sent label.
        title: getAnalyteDisplayForMode(first, audience, locale, nameMode),
        meta: group === 'cancer-screening'
          ? t.reports.tabs.cancerScreening
          : `Observation Group`,
        obs: displayObservations,
        group,
        institution,
        sourceProgram: lst.some(isAdultPreventiveObservation)
          ? 'adult-preventive' as const
          : undefined,
        effectiveDate: first.effectiveDateTime,
      }
    })
  }, [observations, seenIds, audience, locale, nameMode, compositions, t])
}
