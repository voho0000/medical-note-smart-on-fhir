// Custom Hook: Medication Rows Processing
import { useMemo } from 'react'
import type { Medication, MedicationRow } from '../types'
import { getCodeableConceptText, formatDate, extractFrequencyFromText, isChronicPrescription } from '../utils/fhir-helpers'
import { humanDoseAmount, humanDoseFreq, buildDetail } from '../utils/dose-helpers'
import { computeDurationDays } from '../utils/duration-helpers'

export function useMedicationRows(medications: any[]) {
  return useMemo<MedicationRow[]>(() => {
    if (!Array.isArray(medications)) return []

    const inactiveStatuses = new Set(["stopped", "completed"])

    // The bridge emits one MedicationRequest per refill. The chronic
    // (courseOfTherapyType.continuous) flag is set per refill, so a single
    // drug may appear as a mix of "chronic" and "acute" refills depending on
    // which NHI billing code each pharmacy used that month. Aggregate to the
    // drug level — if ANY refill of this medication was chronic, treat every
    // row of that drug as chronic. This matches the bridge's recommended
    // detection logic ("若想顯示哪些是慢性用藥…group by 藥品名").
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
      const statusInactive = inactiveStatuses.has(status)

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
      const stopDateRaw = statusInactive
        ? med.dispenseRequest?.validityPeriod?.end || med.effectiveDateTime || med.authoredOn
        : undefined

      const durationDays = computeDurationDays({
        start: startDateRaw,
        stop: stopDateRaw,
        expectedDuration: med.dispenseRequest?.expectedSupplyDuration,
        boundsDuration: dosage?.timing?.repeat?.boundsDuration,
        boundsPeriod: dosage?.timing?.repeat?.boundsPeriod,
        validityPeriod: med.dispenseRequest?.validityPeriod,
      })

      // Compute endDate from startDate + durationDays
      let endDate: string | undefined
      let daysRemaining: number | undefined
      if (startDateRaw && durationDays) {
        const start = new Date(startDateRaw)
        if (!Number.isNaN(start.getTime())) {
          const end = new Date(start)
          end.setDate(end.getDate() + durationDays)
          endDate = end.toISOString()
          daysRemaining = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        }
      }

      // Inactive = explicitly stopped/completed OR computed endDate has passed
      const isInactive = statusInactive || (daysRemaining !== undefined && daysRemaining < 0)
      // Drug-level chronic: true if any refill of this drug was chronic
      const drugKey =
        med.medicationCodeableConcept?.coding?.[0]?.code ||
        med.medicationCodeableConcept?.text ||
        med.medicationReference?.display ||
        med.code?.text ||
        ''
      const isChronic = !!drugKey && chronicDrugKeys.has(drugKey)

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
        durationDays,
        endDate: endDate ? formatDate(endDate) : undefined,
        daysRemaining,
        isInactive,
        isChronic,
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
