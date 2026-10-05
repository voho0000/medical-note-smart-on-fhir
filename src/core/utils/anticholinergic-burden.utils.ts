// The anticholinergic medicines a patient is taking, counted by the app so a
// small model does not have to: 開藥注意 raises a burden alert by the AGS
// Beers 2023 rules — two or more anticholinergics together (Table 5), or one
// strong anticholinergic with dementia, cognitive impairment, delirium, or
// LUTS/BPH in a man (Table 3) — and never for one medicine otherwise (owner,
// 2026-10-05).

import type { SummarySourceCatalogEntry } from '@/src/core/entities/medical-summary.entity'
import { showsAnticholinergic } from './medicine-profile.utils'

/** "Supplied together": a fill whose supply reached into the 90 days before
 *  the reference date. */
export const ANTICHOLINERGIC_WINDOW_DAYS = 90

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/**
 * "ANTICHOLINERGIC MEDICINES SUPPLIED IN THE 90 DAYS BEFORE 2026-10-05:
 * oxybutynin [M1] ACB 3; imipramine [M23] ACB 3 (2 medicines)." — one entry
 * per ingredient, its newest fill. ACB 1 ("possible") medicines are left out,
 * as on the SOURCE LIST lines. "…: none." when the record holds medicines but
 * none of them is — a small model alerted on one the line had not listed.
 * Undefined when the record holds no medicines at all.
 */
export function anticholinergicMedicinesLine(
  catalog: readonly SummarySourceCatalogEntry[],
  referenceDate?: string,
): string | undefined {
  if (!catalog.some((entry) => entry.resourceType.startsWith('Medication'))) return undefined
  const reference = referenceDate
    ?? catalog.map((entry) => entry.date ?? '').filter(Boolean).sort().at(-1)
  if (!reference) return undefined
  const referenceMs = Date.parse(reference)
  if (Number.isNaN(referenceMs)) return undefined
  const heading = `ANTICHOLINERGIC MEDICINES SUPPLIED IN THE ${ANTICHOLINERGIC_WINDOW_DAYS} DAYS BEFORE ${reference}:`
  const medicines = catalog.filter((entry) =>
    entry.resourceType.startsWith('Medication') && showsAnticholinergic(entry.medicine?.anticholinergic))
  const from = isoDay(referenceMs - ANTICHOLINERGIC_WINDOW_DAYS * 86_400_000)

  const newest = new Map<string, SummarySourceCatalogEntry>()
  for (const entry of medicines) {
    if (!entry.date || entry.date > reference) continue
    if ((entry.supplyEnd ?? entry.date) < from) continue
    const ingredient = entry.medicationClass?.split(' · ')[0]?.trim() || entry.display
    const current = newest.get(ingredient)
    if (!current || (entry.date ?? '') > (current.date ?? '')) newest.set(ingredient, entry)
  }
  if (newest.size === 0) return `${heading} none.`
  const items = [...newest].map(([ingredient, entry]) => `${ingredient} [${entry.key}] ${entry.medicine!.anticholinergic}`)
  return `${heading} ${items.join('; ')} (${newest.size} ${newest.size === 1 ? 'medicine' : 'medicines'}).`
}
