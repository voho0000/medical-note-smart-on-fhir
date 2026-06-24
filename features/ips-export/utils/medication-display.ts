import type { MedicationEntity } from '@/src/core/entities/clinical-data.entity'

export interface MedicationDisplayParts {
  directions: string
  supply: string
}

function clean(value: unknown): string {
  if (value == null) return ''
  return String(value).replace(/\s+/g, ' ').trim()
}

function stripDerivedAverage(text: string): string {
  return text
    .replace(/[（(]\s*平均每日[^）)]*[）)]/g, '')
    .replace(/[（(]\s*average\s+daily[^）)]*[）)]/gi, '')
    .replace(/[，,;；]\s*平均每日\s*[^，,;；）)]*/g, '')
    .replace(/[，,;；]\s*average\s+daily\s*[^，,;；）)]*/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*[，,;；]\s*$/, '')
    .trim()
}

function supplyKeywordIndex(text: string): number {
  const matches = [
    text.search(/給藥總量/),
    text.search(/給藥日數/),
    text.search(/days?\s+supply/i),
    text.search(/total\s+(quantity|qty)/i),
  ].filter((idx) => idx >= 0)
  return matches.length ? Math.min(...matches) : -1
}

function splitDosageText(text: string): MedicationDisplayParts {
  const cleaned = stripDerivedAverage(clean(text))
  if (!cleaned) return { directions: '', supply: '' }

  const directions: string[] = []
  const supply: string[] = []
  for (const rawPart of cleaned.split(/[;；]/)) {
    const part = clean(rawPart)
    if (!part) continue
    const idx = supplyKeywordIndex(part)
    if (idx === -1) {
      directions.push(part)
      continue
    }

    const before = clean(part.slice(0, idx).replace(/[，,]$/, ''))
    const after = clean(part.slice(idx))
    if (before) directions.push(before)
    if (after) supply.push(after)
  }

  return {
    directions: directions.join('; '),
    supply: supply.join('; '),
  }
}

export function medicationDisplayParts(med: MedicationEntity): MedicationDisplayParts {
  const directions: string[] = []
  const supply: string[] = []

  for (const dosage of med.dosageInstruction ?? []) {
    const parsed = splitDosageText(dosage.text || '')
    if (parsed.directions) directions.push(parsed.directions)
    if (parsed.supply) supply.push(parsed.supply)
  }

  return {
    directions: directions.join('; '),
    supply: supply.join('; '),
  }
}

export function medicationDirectionsForFhir(med: MedicationEntity): string {
  return medicationDisplayParts(med).directions
}
