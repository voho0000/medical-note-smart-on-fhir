// Hook: derive vaccine rows from raw MedicationRequest[].
//
// Vaccines arrive as MedicationRequests (bridge maps NHI vaccine 領藥
// → MedicationRequest). isVaccine() picks them out by category keyword
// or product-name signature. This hook groups same-vaccine repeat doses
// (flu yearly, COVID series, HPV 3-dose) and surfaces dose history.
import { useMemo } from 'react'
import {
  isChronicPrescription,
  pickLocalizedText,
  pickByLocale,
} from '../utils/fhir-helpers'
import { formatDate } from '@/src/shared/utils/fhir-helpers'
import { isVaccine } from '../utils/vaccine-detection'

export interface VaccineDoseEvent {
  id: string
  date?: string             // ISO original
  dateLabel?: string        // formatted for display
  provider?: string         // requester.display
  icdCode?: string
  icdText?: string
}

export interface VaccineRow {
  id: string
  name: string              // vaccine product name (audience+locale-aware)
  category?: string         // 健保署 藥理分類 (locale-aware)
  doses: VaccineDoseEvent[] // sorted newest-first
  /** Latest dose's date for sorting + summary */
  lastDoseDateIso?: string
  lastDoseDateLabel?: string
  lastProvider?: string
}

function vaccineKeyOf(med: any): string {
  return (
    med?.medicationCodeableConcept?.coding?.[0]?.code ||
    med?.medicationCodeableConcept?.text ||
    med?.medicationReference?.display ||
    ''
  )
}

export function useVaccineRows(
  medications: any[],
  audience: 'medical' | 'patient' = 'medical',
  locale: string = 'zh-TW',
): VaccineRow[] {
  return useMemo<VaccineRow[]>(() => {
    if (!Array.isArray(medications)) return []

    // Group vaccine MRs by product key.
    const byKey = new Map<string, VaccineRow>()

    for (const med of medications) {
      if (!med) continue
      if (!isVaccine(med)) continue
      if (isChronicPrescription(med)) continue // chronic refill that happens to be vaccine — unusual; still skip

      const key = vaccineKeyOf(med)
      if (!key) continue

      const dateIso: string | undefined = med.authoredOn || med.effectiveDateTime
      const dateLabel = formatDate(dateIso) || undefined

      // ICD reason — follows locale (same rule as billing-ICD in med list).
      const rawIcd = pickByLocale(med.reasonCode?.[0], locale)
      const icdCode: string | undefined = med.reasonCode?.[0]?.coding?.[0]?.code
      const icdText = rawIcd
        ? rawIcd.replace(/^[A-Z]\d+(\.\d+)?\s+/, '').trim() || undefined
        : undefined

      const dose: VaccineDoseEvent = {
        id: med.id || `${key}-${dateIso ?? Math.random().toString(36).slice(2)}`,
        date: dateIso,
        dateLabel,
        provider: med.requester?.display?.trim() || undefined,
        icdCode,
        icdText,
      }

      const existing = byKey.get(key)
      if (existing) {
        existing.doses.push(dose)
      } else {
        byKey.set(key, {
          id: key,
          name:
            pickLocalizedText(med.medicationCodeableConcept, audience, locale) ||
            med.medicationCodeableConcept?.text ||
            'Unknown Vaccine',
          category: pickByLocale(med.category?.[0], locale) || undefined,
          doses: [dose],
          lastDoseDateIso: dateIso,
          lastDoseDateLabel: dateLabel,
          lastProvider: dose.provider,
        })
      }
    }

    // Sort doses newest-first within each row and update last-dose fields.
    for (const row of byKey.values()) {
      row.doses.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      const latest = row.doses[0]
      row.lastDoseDateIso = latest?.date
      row.lastDoseDateLabel = latest?.dateLabel
      row.lastProvider = latest?.provider
    }

    // Sort rows by most-recent dose first.
    return [...byKey.values()].sort(
      (a, b) => (b.lastDoseDateIso || '').localeCompare(a.lastDoseDateIso || ''),
    )
  }, [medications, audience, locale])
}
