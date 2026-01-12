import { useMemo } from "react"
import { getReferenceId, getCodeText, getMedicationName, formatDateTime, valueWithUnit, refRangeText, getInterpTag } from "../utils/formatters"
import type { EncounterObservation } from "../components/EncounterObservationCard"
import type { EncounterMedication, EncounterProcedure } from "../components/EncounterCards"
import type { ClinicalNote } from "./useClinicalNotes"

export type EncounterDetails = {
  medications: EncounterMedication[]
  tests: EncounterObservation[]
  procedures: EncounterProcedure[]
  clinicalNotes: ClinicalNote[]
}

const toEncounterObservation = (observation: any, source: "diagnosticReport" | "observation"): EncounterObservation => {
  const title = getCodeText(observation?.code) || "Observation"
  const interpretation = getInterpTag(observation?.interpretation)
  const referenceText = refRangeText(observation?.referenceRange)
  const components = Array.isArray(observation?.component)
    ? observation.component.map((component: any, index: number) => {
        const componentInterpretation = getInterpTag(component?.interpretation)
        return {
          id: component?.id || `${observation?.id || "component"}-${index}`,
          title: getCodeText(component?.code) || "Component",
          value: component?.valueQuantity
            ? valueWithUnit(component.valueQuantity)
            : component?.valueString || "—",
          interpretationLabel: componentInterpretation?.label,
          interpretationStyle: componentInterpretation?.style,
          referenceText: refRangeText(component?.referenceRange),
        }
      })
    : []

  return {
    id: observation?.id || `${source}-${Math.random().toString(36).slice(2, 10)}`,
    title,
    value: observation?.valueQuantity
      ? valueWithUnit(observation.valueQuantity)
      : observation?.valueString || "—",
    interpretationLabel: interpretation?.label,
    interpretationStyle: interpretation?.style,
    referenceText,
    effectiveDateTime: observation?.effectiveDateTime,
    status: observation?.status,
    source,
    components,
  }
}

export function useEncounterDetails(
  medications: any[],
  diagnosticReports: any[],
  observations: any[],
  procedures: any[],
  clinicalNotes: ClinicalNote[],
  locale: string = "en-US"
) {
  return useMemo(() => {
    const map = new Map<string, EncounterDetails>()

    const ensureEntry = (encounterId: string) => {
      if (!map.has(encounterId)) {
        map.set(encounterId, { medications: [], tests: [], procedures: [], clinicalNotes: [] })
      }
      return map.get(encounterId)!
    }

    if (Array.isArray(medications)) {
      medications.forEach((med: any) => {
        const encounterId = getReferenceId(med?.encounter)
        if (!encounterId) return
        const entry = ensureEntry(encounterId)
        const medId = med?.id || `${encounterId}-med-${entry.medications.length}`
        if (entry.medications.some((item) => item.id === medId)) return

        entry.medications.push({
          id: medId,
          name: getMedicationName(med),
          status: med?.status,
          detail: med?.dosageInstruction?.[0]?.text,
          when: formatDateTime(med?.authoredOn, locale),
        })
      })
    }

    if (Array.isArray(diagnosticReports)) {
      diagnosticReports.forEach((report: any) => {
        const encounterId = getReferenceId(report?.encounter)
        if (!encounterId) return
        const entry = ensureEntry(encounterId)
        const observations = Array.isArray(report?._observations)
          ? report._observations.filter((obs: any) => obs?.resourceType === "Observation")
          : []

        observations.forEach((obs: any) => {
          const normalized = toEncounterObservation(obs, "diagnosticReport")
          if (entry.tests.some((item) => item.id === normalized.id)) return
          entry.tests.push(normalized)
        })
      })
    }

    if (Array.isArray(observations)) {
      observations.forEach((obs: any) => {
        const encounterId = getReferenceId(obs?.encounter)
        if (!encounterId) return
        const entry = ensureEntry(encounterId)
        const normalized = toEncounterObservation(obs, "observation")
        if (entry.tests.some((item) => item.id === normalized.id)) return
        entry.tests.push(normalized)
      })
    }

    if (Array.isArray(procedures)) {
      procedures.forEach((procedure: any) => {
        const encounterId = getReferenceId(procedure?.encounter)
        if (!encounterId) return
        const entry = ensureEntry(encounterId)
        const id = procedure?.id || `${encounterId}-procedure-${entry.procedures.length}`
        if (entry.procedures.some((existing) => existing.id === id)) return

        entry.procedures.push({
          id,
          title: getCodeText(procedure?.code) || "Procedure",
          status: procedure?.status,
          performer: procedure?.performer?.[0]?.actor?.display,
          performed: procedure?.performedDateTime || procedure?.performedPeriod?.start,
          category: getCodeText(procedure?.category),
          outcome: getCodeText(procedure?.outcome),
          report: Array.isArray(procedure?.report)
            ? procedure.report.map((ref: any) => ref?.display || ref?.reference).filter(Boolean)
            : [],
        })
      })
    }

    // Associate clinical notes with encounters
    if (Array.isArray(clinicalNotes)) {
      clinicalNotes.forEach((note: ClinicalNote) => {
        const encounterId = getReferenceId({ reference: note.encounterRef })
        if (!encounterId) return
        const entry = ensureEntry(encounterId)
        if (entry.clinicalNotes.some((existing) => existing.id === note.id)) return
        entry.clinicalNotes.push(note)
      })
    }

    return map
  }, [medications, diagnosticReports, observations, procedures, clinicalNotes, locale])
}
