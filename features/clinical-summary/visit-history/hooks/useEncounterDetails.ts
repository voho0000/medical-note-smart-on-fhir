import { useMemo } from "react"
import { getReferenceId, getCodeText, getMedicationName, getMedicationNameLocalized, formatDateTime, valueWithUnit, refRangeText, getInterpTag } from "../utils/formatters"
import { checkReferenceRangeAbnormal } from "@/features/clinical-summary/reports/utils/interpretation-helpers"
import { isChronicPrescription } from "@/features/clinical-summary/medications/utils/fhir-helpers"
import type { EncounterObservation } from "../components/EncounterObservationCard"
import type { EncounterMedication, EncounterProcedure } from "../components/EncounterCards"
import type { ClinicalNote } from "./useClinicalNotes"

export type EncounterDiagnosis = {
  id: string
  title: string
  code?: string
  clinicalStatus?: string
  verificationStatus?: string
  recordedDate?: string
}

export type EncounterDetails = {
  diagnoses: EncounterDiagnosis[]
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
          refRangeAbnormal: checkReferenceRangeAbnormal(component),
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
    refRangeAbnormal: checkReferenceRangeAbnormal(observation),
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
  conditions: any[],
  locale: string = "en-US",
  audience: 'medical' | 'patient' = 'medical',
) {
  return useMemo(() => {
    const map = new Map<string, EncounterDetails>()

    const ensureEntry = (encounterId: string) => {
      if (!map.has(encounterId)) {
        map.set(encounterId, { diagnoses: [], medications: [], tests: [], procedures: [], clinicalNotes: [] })
      }
      return map.get(encounterId)!
    }

    if (Array.isArray(medications)) {
      // Drug-level chronic aggregation: the bridge tags each refill individually,
      // and a chronic drug may have occasional acute refills. Treat a drug as
      // chronic for this patient if ANY refill in the whole dataset was tagged.
      // Mirrors the same aggregation used in features/clinical-summary/medications/
      // hooks/useMedicationRows.ts so the badge appears consistently across views.
      const chronicDrugKeys = new Set<string>()
      for (const m of medications) {
        if (!m) continue
        if (!isChronicPrescription(m)) continue
        const key =
          m.medicationCodeableConcept?.coding?.[0]?.code ||
          m.medicationCodeableConcept?.text ||
          m.medicationReference?.display ||
          m.code?.text ||
          ''
        if (key) chronicDrugKeys.add(key)
      }

      medications.forEach((med: any) => {
        const encounterId = getReferenceId(med?.encounter)
        if (!encounterId) return
        const entry = ensureEntry(encounterId)
        const medId = med?.id || `${encounterId}-med-${entry.medications.length}`
        if (entry.medications.some((item) => item.id === medId)) return

        const drugKey =
          med?.medicationCodeableConcept?.coding?.[0]?.code ||
          med?.medicationCodeableConcept?.text ||
          med?.medicationReference?.display ||
          med?.code?.text ||
          ''
        const isChronic = !!drugKey && chronicDrugKeys.has(drugKey)

        entry.medications.push({
          id: medId,
          name: getMedicationNameLocalized(med, audience, locale),
          status: med?.status,
          detail: med?.dosageInstruction?.[0]?.text,
          when: formatDateTime(med?.authoredOn, locale),
          isChronic,
        })
      })
    }

    if (Array.isArray(diagnosticReports)) {
      diagnosticReports.forEach((report: any) => {
        const encounterId = getReferenceId(report?.encounter)
        if (!encounterId) return
        const entry = ensureEntry(encounterId)
        const observations = Array.isArray(report?._observations)
          ? report._observations
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

    // Group conditions by encounter reference
    if (Array.isArray(conditions)) {
      conditions.forEach((condition: any) => {
        const encounterId = getReferenceId(condition?.encounter)
        if (!encounterId) return
        const entry = ensureEntry(encounterId)
        const id = condition?.id || `${encounterId}-dx-${entry.diagnoses.length}`
        if (entry.diagnoses.some((d) => d.id === id)) return

        const coding = condition?.code?.coding
        const icdCode = coding?.find((c: any) =>
          c.system?.toLowerCase().includes('icd')
        )?.code || coding?.[0]?.code

        entry.diagnoses.push({
          id,
          title: condition?.code?.text
            || coding?.[0]?.display
            || coding?.[0]?.code
            || 'Unknown diagnosis',
          code: icdCode,
          clinicalStatus: condition?.clinicalStatus?.coding?.[0]?.code
            || (typeof condition?.clinicalStatus === 'string' ? condition.clinicalStatus : undefined),
          verificationStatus: condition?.verificationStatus?.coding?.[0]?.code
            || (typeof condition?.verificationStatus === 'string' ? condition.verificationStatus : undefined),
          recordedDate: condition?.recordedDate || condition?.dateRecorded,
        })
      })
    }

    return map
  }, [medications, diagnosticReports, observations, procedures, clinicalNotes, conditions, locale, audience])
}
