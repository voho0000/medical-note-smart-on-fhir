// Custom Hook: Medication Rows Processing
import { useMemo } from 'react'
import type { Medication, MedicationRow } from '../types'
import { getCodeableConceptText, formatDate, extractFrequencyFromText } from '../utils/fhir-helpers'
import { humanDoseAmount, humanDoseFreq, buildDetail } from '../utils/dose-helpers'
import { computeDurationDays } from '../utils/duration-helpers'

export function useMedicationRows(medications: any[]) {
  return useMemo<MedicationRow[]>(() => {
    if (!Array.isArray(medications)) return []

    const inactiveStatuses = new Set(["stopped", "completed"])

    const enriched = medications.map((med: any) => {
      const dosage = med.dosageInstruction?.[0] || med.dosage?.[0]

      let medicationName = 'Unknown Medication'
      if (med.medicationCodeableConcept) {
        medicationName = getCodeableConceptText(med.medicationCodeableConcept)
      } else if (med.medicationReference?.display) {
        medicationName = med.medicationReference.display
      } else if (med.code?.text) {
        medicationName = med.code.text
      } else if (med.medication?.text) {
        medicationName = med.medication.text
      } else if (med.resource?.code?.text) {
        medicationName = med.resource.code.text
      } else if (med.code?.coding?.[0]?.display) {
        medicationName = med.code.coding[0].display
      }

      const status = med.status?.toLowerCase() || "unknown"
      const isInactive = inactiveStatuses.has(status)

      const doseSummary = humanDoseAmount(dosage?.doseAndRate, dosage?.text)
      const routeSummary = getCodeableConceptText(dosage?.route)
      const frequencySummary = humanDoseFreq(dosage?.timing?.repeat) || extractFrequencyFromText(dosage?.text) || ""

      const detail = buildDetail({
        doseAndRate: dosage?.doseAndRate,
        doseText: dosage?.text,
        route: dosage?.route,
        repeat: dosage?.timing?.repeat
      })

      const startDateRaw = med.authoredOn || med.effectiveDateTime || med.dispenseRequest?.validityPeriod?.start
      const stopDateRaw = isInactive
        ? med.dispenseRequest?.validityPeriod?.end || med.effectiveDateTime || med.authoredOn
        : undefined

      return {
        id: med.id || Math.random().toString(36),
        title: medicationName,
        status,
        detail: detail || undefined,
        dose: doseSummary || undefined,
        route: routeSummary && routeSummary !== "—" ? routeSummary : undefined,
        frequency: frequencySummary || undefined,
        startedOn: formatDate(startDateRaw),
        stoppedOn: stopDateRaw ? formatDate(stopDateRaw) : undefined,
        durationDays: computeDurationDays({
          start: startDateRaw,
          stop: stopDateRaw,
          expectedDuration: med.dispenseRequest?.expectedSupplyDuration,
          boundsDuration: dosage?.timing?.repeat?.boundsDuration,
          boundsPeriod: dosage?.timing?.repeat?.boundsPeriod,
          validityPeriod: med.dispenseRequest?.validityPeriod,
        }),
        isInactive,
        _startSortValue: startDateRaw ? new Date(startDateRaw).getTime() : 0
      }
    })

    return enriched
      .sort((a: any, b: any) => {
        if (a.isInactive !== b.isInactive) {
          return a.isInactive ? 1 : -1
        }
        return (b._startSortValue ?? 0) - (a._startSortValue ?? 0)
      })
      .map(({ _startSortValue, ...row }: any) => row)
  }, [medications])
}
