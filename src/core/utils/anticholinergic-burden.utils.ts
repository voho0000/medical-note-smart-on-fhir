// The anticholinergic medicines a patient is taking, counted by the app so a
// small model does not have to. 開藥注意 raises an anticholinergic alert by
// the AGS Beers 2023 rules — two or more anticholinergics together (Table 5),
// or one strong anticholinergic with dementia, cognitive impairment, delirium,
// or LUTS/BPH in a man (Table 3), plus urinary retention in anyone — and never
// for one medicine otherwise (owner, 2026-10-05). An alert that does not meet
// them is labelled 待核對, never removed.

import type { SummarySourceCatalogEntry } from '@/src/core/entities/medical-summary.entity'
import { showsAnticholinergic } from './medicine-profile.utils'

/** "Supplied together": a fill whose supply reached into the 90 days before
 *  the reference date. */
export const ANTICHOLINERGIC_WINDOW_DAYS = 90

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export interface CurrentAnticholinergic {
  /** "oxybutynin", from the medication class. */
  ingredient: string
  /** The newest fill. */
  entry: SummarySourceCatalogEntry
}

/** The reference date the counts use: the given one, else the newest record. */
const referenceOf = (catalog: readonly SummarySourceCatalogEntry[], referenceDate?: string) =>
  referenceDate ?? catalog.map((entry) => entry.date ?? '').filter(Boolean).sort().at(-1)

/**
 * The anticholinergic medicines (ACB 2–3, Beers strong, or an antimuscarinic
 * mechanism) whose supply reached the 90 days before the reference date, one
 * per ingredient. ACB 1 ("possible") medicines are not counted, as on the
 * SOURCE LIST lines.
 */
export function currentAnticholinergicMedicines(
  catalog: readonly SummarySourceCatalogEntry[],
  referenceDate?: string,
): CurrentAnticholinergic[] {
  const reference = referenceOf(catalog, referenceDate)
  const referenceMs = reference ? Date.parse(reference) : Number.NaN
  if (!reference || Number.isNaN(referenceMs)) return []
  const from = isoDay(referenceMs - ANTICHOLINERGIC_WINDOW_DAYS * 86_400_000)
  const newest = new Map<string, SummarySourceCatalogEntry>()
  for (const entry of catalog) {
    if (!entry.resourceType.startsWith('Medication') || !showsAnticholinergic(entry.medicine?.anticholinergic)) continue
    if (!entry.date || entry.date > reference) continue
    if ((entry.supplyEnd ?? entry.date) < from) continue
    const ingredient = entry.medicationClass?.split(' · ')[0]?.trim() || entry.display
    const current = newest.get(ingredient)
    if (!current || entry.date > (current.date ?? '')) newest.set(ingredient, entry)
  }
  return [...newest].map(([ingredient, entry]) => ({ ingredient, entry }))
}

/**
 * "ANTICHOLINERGIC MEDICINES SUPPLIED IN THE 90 DAYS BEFORE 2026-10-05:
 * oxybutynin [M1] ACB 3; imipramine [M23] ACB 3 (2 medicines)." — or "…:
 * none." when the record holds medicines but none of them is (a small model
 * alerted on one the line had not listed). Undefined when the record holds no
 * medicines at all.
 */
export function anticholinergicMedicinesLine(
  catalog: readonly SummarySourceCatalogEntry[],
  referenceDate?: string,
): string | undefined {
  if (!catalog.some((entry) => entry.resourceType.startsWith('Medication'))) return undefined
  const reference = referenceOf(catalog, referenceDate)
  if (!reference || Number.isNaN(Date.parse(reference))) return undefined
  const heading = `ANTICHOLINERGIC MEDICINES SUPPLIED IN THE ${ANTICHOLINERGIC_WINDOW_DAYS} DAYS BEFORE ${reference}:`
  const medicines = currentAnticholinergicMedicines(catalog, reference)
  if (medicines.length === 0) return `${heading} none.`
  const items = medicines.map(({ ingredient, entry }) => `${ingredient} [${entry.key}] ${entry.medicine!.anticholinergic}`)
  return `${heading} ${items.join('; ')} (${medicines.length} ${medicines.length === 1 ? 'medicine' : 'medicines'}).`
}

const ANTICHOLINERGIC_CLAIM = /anti-?cholinergic|anti-?muscarinic|抗膽鹼|抗毒蕈鹼/i
// A condition one strong anticholinergic is an alert with (Beers 2023 Table
// 3, and urinary retention in anyone).
const QUALIFYING_CONDITION =
  /dementia|cognitive|delirium|confusion|\bBPH\b|prostat|\bLUTS\b|lower urinary tract|urinary (retention|symptoms?)|retention of urine|失智|認知|譫妄|攝護腺|前列腺|尿滯留|排尿|解尿/i

/** Why an anticholinergic alert does not meet the alert rules, if it does not. */
export type AnticholinergicAlertReview = 'none-supplied' | 'one-without-condition'

/**
 * Judged on the alert's title and detail against the count the app made:
 * none supplied in the window, or one without a qualifying condition named.
 * Age is not checked here. Undefined for an alert that is not about
 * anticholinergics, or that meets the rules.
 */
export function reviewAnticholinergicAlert(
  alert: { title: string; detail: string },
  currentCount: number,
): AnticholinergicAlertReview | undefined {
  const text = `${alert.title} ${alert.detail}`
  if (!ANTICHOLINERGIC_CLAIM.test(text)) return undefined
  if (currentCount === 0) return 'none-supplied'
  if (currentCount === 1 && !QUALIFYING_CONDITION.test(text)) return 'one-without-condition'
  return undefined
}
