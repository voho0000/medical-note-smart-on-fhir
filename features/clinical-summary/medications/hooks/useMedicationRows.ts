// Custom Hook: Medication Rows Processing
import { useMemo } from 'react'
import type { Medication, MedicationRow } from '../types'
import {
  getCodeableConceptText,
  formatDate,
  extractFrequencyFromText,
  isChronicPrescription,
  pickLocalizedText,
  pickByLocale,
} from '../utils/fhir-helpers'
import { isVaccine } from '../utils/vaccine-detection'
import { humanDoseAmount, humanDoseFreq, buildDetail } from '../utils/dose-helpers'
import { computeDurationDays } from '../utils/duration-helpers'

export function useMedicationRows(
  medications: any[],
  audience: 'medical' | 'patient' = 'medical',
  locale: string = 'zh-TW',
) {
  return useMemo<MedicationRow[]>(() => {
    if (!Array.isArray(medications)) return []

    // Vaccines live in the dedicated 疫苗 sub-tab; exclude them from the
    // medication list so "Currently in use" doesn't mis-classify a one-off
    // tetanus shot as an active medication with "supply expired" status.
    medications = medications.filter((m) => !isVaccine(m))

    const inactiveStatuses = new Set(["stopped", "completed"])

    const drugKeyOf = (m: any): string =>
      m?.medicationCodeableConcept?.coding?.[0]?.code ||
      m?.medicationCodeableConcept?.text ||
      m?.medicationReference?.display ||
      m?.code?.text ||
      ''

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
      const key = drugKeyOf(m)
      if (key) chronicDrugKeys.add(key)
    }

    // Refill-history aggregates (per drug). Used to surface "Refills: 11 次
    // since 2023-12" on each row without forcing the user to expand the
    // per-drug accordion in the Medication History section.
    const refillsByDrug = new Map<string, { count: number; firstDate?: string }>()
    for (const m of medications) {
      if (!m) continue
      const key = drugKeyOf(m)
      if (!key) continue
      const date = m.authoredOn || m.effectiveDateTime
      const entry = refillsByDrug.get(key)
      if (!entry) {
        refillsByDrug.set(key, { count: 1, firstDate: date })
      } else {
        entry.count++
        if (date && (!entry.firstDate || date < entry.firstDate)) {
          entry.firstDate = date
        }
      }
    }

    const enriched = medications.map((med: any) => {
      const dosage = med.dosageInstruction?.[0] || med.dosage?.[0]

      // Audience-aware drug-name resolution. Bridge v0.6.10+ puts the
      // localized (zh-TW) name in `.text` and the English name in
      // `.coding[].display`; medical users get English (pharmacology
      // familiarity), patient users get Chinese. Older bundles with only
      // English `.text` fall through gracefully.
      let medicationName: string
      if (med.medicationCodeableConcept) {
        medicationName = pickLocalizedText(med.medicationCodeableConcept, audience, locale)
      } else if (med.medicationReference?.display) {
        medicationName = med.medicationReference.display
      } else if (med.code) {
        medicationName = pickLocalizedText(med.code, audience, locale)
      } else if (med.medication?.text) {
        medicationName = med.medication.text
      } else if (med.resource?.code) {
        medicationName = pickLocalizedText(med.resource.code, audience, locale)
      } else {
        medicationName = ''
      }
      if (!medicationName) medicationName = 'Unknown Medication'

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
      const drugKey = drugKeyOf(med)
      const isChronic = !!drugKey && chronicDrugKeys.has(drugKey)

      const refillAgg = drugKey ? refillsByDrug.get(drugKey) : undefined
      const refillCount = refillAgg?.count ?? 1
      const firstRefillDate = refillAgg?.firstDate ? formatDate(refillAgg.firstDate) : undefined

      // Per-refill metadata that downstream UI surfaces inline.
      const pharmacy = med?.requester?.display?.trim() || undefined
      // Drug category (e.g. "降血壓藥" / "HYPOTENSIVE AGENTS"). Bridge
      // v0.6.10+ sends both Chinese (text) and English (coding[].display).
      // Follow UI locale, NOT audience — medical professionals on a zh-TW
      // UI still expect 降血壓藥 because category is a descriptor (not a
      // technical pharmacology name like the drug itself).
      const categoryRaw = pickByLocale(med?.category?.[0], locale)
      const category = categoryRaw
        ? categoryRaw.replace(/\s+/g, ' ').trim() || undefined
        : undefined
      const icdCoding = med?.reasonCode?.[0]?.coding?.[0]
      const icdCode = icdCoding?.code || undefined
      // ICD descriptions follow UI locale, NOT audience: medical users on a
      // zh-TW UI still want 中文 ("良性攝護腺增生") because the description
      // is a clinical concept, not a technical pharmacology identifier.
      // The leading code prefix ("N400 ...") is stripped below.
      const rawIcdText = pickByLocale(med?.reasonCode?.[0], locale)
      const icdText = rawIcdText
        ? rawIcdText.replace(/^[A-Z]\d+(\.\d+)?\s+/, '').trim() || undefined
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
        durationDays,
        endDate: endDate ? formatDate(endDate) : undefined,
        daysRemaining,
        isInactive,
        isChronic,
        category,
        pharmacy,
        icdCode,
        icdText,
        refillCount,
        firstRefillDate,
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
    // `audience` controls drug-name and ICD localisation; `locale` drives
    // category labels. Both must be in deps so flipping either updates the
    // list immediately instead of requiring a page reload.
  }, [medications, audience, locale])
}
