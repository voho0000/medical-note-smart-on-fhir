// Vaccine rows derived from FHIR R4 Immunization resources (NHI 疾病管制署
// 預防接種紀錄). Bridge v0.7.x+ ships these alongside MedicationRequest so
// therapeutic vaccine prescriptions (e.g. post-injury tetanus shot at a
// surgery clinic) stay in the medication list, while genuine preventive
// vaccinations (flu, pneumococcal, COVID, etc.) surface here.
import { useMemo } from 'react'
import { formatDate } from '@/src/shared/utils/fhir-helpers'
import { pickByLocale, pickLocalizedText } from '../utils/fhir-helpers'
import type { ImmunizationEntity } from '@/src/core/entities/clinical-data.entity'

export interface VaccineDoseEvent {
  id: string
  date?: string
  dateLabel?: string
  provider?: string
  lotNumber?: string
  manufacturer?: string
  source?: string  // 來源 (e.g. 疾病管制署)
  // Legacy fields kept for UI compatibility (Immunization resources don't carry these,
  // but the rendering layer reads them defensively for historical bundles).
  icdCode?: string
  icdText?: string
}

export interface VaccineRow {
  id: string
  name: string
  category?: string  // optional; Immunization rarely carries one
  doses: VaccineDoseEvent[]  // sorted newest-first
  lastDoseDateIso?: string
  lastDoseDateLabel?: string
  lastProvider?: string
}

function vaccineKeyOf(imm: any): string {
  // Prefer code (canonical) → text (display) → name fallback
  return (
    imm?.vaccineCode?.coding?.[0]?.code ||
    imm?.vaccineCode?.text ||
    imm?.vaccineCode?.coding?.[0]?.display ||
    ''
  )
}

function noteToSource(note: any[] | undefined): string | undefined {
  if (!Array.isArray(note)) return undefined
  for (const n of note) {
    const txt: string | undefined = n?.text
    if (!txt) continue
    // Match "來源: 疾病管制署" or "Source: CDC"
    const m = txt.match(/(?:來源|Source)\s*[:：]?\s*(.+)/i)
    if (m) return m[1].trim()
  }
  return undefined
}

export function useVaccineRows(
  immunizations: ImmunizationEntity[],
  audience: 'medical' | 'patient' = 'medical',
  locale: string = 'zh-TW',
): VaccineRow[] {
  return useMemo<VaccineRow[]>(() => {
    if (!Array.isArray(immunizations)) return []

    const byKey = new Map<string, VaccineRow>()

    for (const imm of immunizations) {
      if (!imm) continue
      const key = vaccineKeyOf(imm)
      if (!key) continue

      const dateIso = imm.occurrenceDateTime
      const dateLabel = formatDate(dateIso) || undefined
      const provider = imm.performer?.[0]?.actor?.display?.trim() || undefined

      const dose: VaccineDoseEvent = {
        id: imm.id || `${key}-${dateIso ?? Math.random().toString(36).slice(2)}`,
        date: dateIso,
        dateLabel,
        provider,
        lotNumber: imm.lotNumber,
        manufacturer: imm.manufacturer?.display,
        source: noteToSource(imm.note),
      }

      const existing = byKey.get(key)
      if (existing) {
        existing.doses.push(dose)
      } else {
        byKey.set(key, {
          id: key,
          name:
            pickLocalizedText(imm.vaccineCode, audience, locale) ||
            imm.vaccineCode?.text ||
            'Unknown Vaccine',
          // Immunization doesn't usually carry a CodeableConcept "category" the way
          // MedicationRequest does. If a future bridge release adds one, surface it.
          category: pickByLocale((imm as any).category?.[0], locale) || undefined,
          doses: [dose],
          lastDoseDateIso: dateIso,
          lastDoseDateLabel: dateLabel,
          lastProvider: provider,
        })
      }
    }

    for (const row of byKey.values()) {
      row.doses.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      const latest = row.doses[0]
      row.lastDoseDateIso = latest?.date
      row.lastDoseDateLabel = latest?.dateLabel
      row.lastProvider = latest?.provider
    }

    return [...byKey.values()].sort(
      (a, b) => (b.lastDoseDateIso || '').localeCompare(a.lastDoseDateIso || ''),
    )
  }, [immunizations, audience, locale])
}
