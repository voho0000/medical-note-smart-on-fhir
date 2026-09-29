// Pairs a report's MediCloud raw rows with its converted rows, for the
// developer viewer. Most converted Observations carry no pointer back to
// their source row, so the pairing is a best match on what both sides show:
// the same day, the same order code or test name, and — when values were
// attached — the same value. Unpaired raw rows are the ones the conversion
// dropped (or turned into something unrecognisable); unpaired converted rows
// have no raw row that explains them.
import type { LabDataReportRawRow, LabDataReportRow } from '../types'

export interface RawPairing {
  /** raw ref → converted ref */
  convertedByRaw: Map<number, number>
  /** converted ref → raw ref */
  rawByConverted: Map<number, number>
  /** Raw refs paired on day and test although the values differ — itself a
   *  sign of a conversion error (unit, decimal, comparator). */
  valueDiffers: Set<number>
  unmatchedRaw: number[]
  /** Converted IMUE0060 rows with no raw row. */
  unmatchedConverted: number[]
  /** Converted rows from another MediCloud module (e.g. IMUE0140): the raw
   *  rows sent cover IMUE0060 only, so these have none by design. */
  otherSource: number[]
}

const normalize = (text: string | undefined) =>
  (text ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '')

function rawDays(row: LabDataReportRawRow): Set<number> {
  return new Set(Object.values(row.dates).map((date) => date!.day))
}

function rawName(row: LabDataReportRawRow): string {
  return normalize(row.fields.assay_item_name ?? row.fields.assaY_NAME)
}

function rawValue(row: LabDataReportRawRow): string | number | undefined {
  return row.results.assay_value ?? row.results.assaY_VALUE
}

function convertedValue(row: LabDataReportRow): string | number | undefined {
  const value = row.value
  switch (value.kind) {
    case 'quantity': return value.value
    case 'string': return value.value
    case 'coded': return value.text ?? value.code
    default: return undefined
  }
}

const asNumber = (value: string | number): number | null => {
  if (typeof value === 'number') return value
  const match = value.trim().match(/^[<>≦≧=]*\s*(-?\d+(?:\.\d+)?)$/)
  if (match) return Number(match[1])
  // "2.33 ng/mL", "(2.33)": a text with exactly one number is that number.
  const numbers = value.match(/-?\d+(?:\.\d+)?/g)
  return numbers?.length === 1 ? Number(numbers[0]) : null
}

const SOURCE_MODULE = 'source-module:'

/** The converted row came from IMUE0060, or does not say where it came from. */
function fromLabSource(row: LabDataReportRow): boolean {
  const sourceModule = row.sourceTags.find((tag) => tag.startsWith(SOURCE_MODULE))
  return !sourceModule || sourceModule.slice(SOURCE_MODULE.length).toLowerCase() === 'imue0060'
}

/** Values agree, or at least one side was not attached. */
function sameValue(raw: string | number | undefined, converted: string | number | undefined): boolean {
  if (raw === undefined || converted === undefined) return true
  const a = asNumber(raw)
  const b = asNumber(converted)
  if (a !== null && b !== null) return Math.abs(a - b) < 1e-9
  return normalize(String(raw)) === normalize(String(converted))
}

function sameTest(raw: LabDataReportRawRow, converted: LabDataReportRow): boolean {
  const orderCode = raw.fields.order_code?.trim()
  if (orderCode && converted.code.codings.some((coding) => coding.code === orderCode)) return true
  const name = rawName(raw)
  if (!name) return false
  return normalize(converted.code.text) === name
    || converted.code.codings.some((coding) => normalize(coding.display) === name)
}

export function pairRawRows(converted: readonly LabDataReportRow[], raw: readonly LabDataReportRawRow[]): RawPairing {
  const convertedByRaw = new Map<number, number>()
  const rawByConverted = new Map<number, number>()
  // Index converted rows by day so a report of thousands pairs quickly.
  const byDay = new Map<number, LabDataReportRow[]>()
  for (const row of converted) {
    if (row.day === null) continue
    byDay.set(row.day, [...(byDay.get(row.day) ?? []), row])
  }

  const valueDiffers = new Set<number>()
  // Three passes: equal values first (so a value-less candidate never takes a
  // row a later raw row matches exactly), then rows where a value is missing,
  // then same day and test with different values (flagged).
  for (const pass of ['equal', 'compatible', 'differs'] as const) {
    for (const rawRow of raw) {
      if (convertedByRaw.has(rawRow.ref)) continue
      const value = rawValue(rawRow)
      for (const day of rawDays(rawRow)) {
        const match = (byDay.get(day) ?? []).find((row) => {
          if (rawByConverted.has(row.ref) || !fromLabSource(row) || !sameTest(rawRow, row)) return false
          const other = convertedValue(row)
          if (pass === 'equal') return value !== undefined && other !== undefined && sameValue(value, other)
          if (pass === 'compatible') return sameValue(value, other)
          return true
        })
        if (match) {
          convertedByRaw.set(rawRow.ref, match.ref)
          rawByConverted.set(match.ref, rawRow.ref)
          if (pass === 'differs') valueDiffers.add(rawRow.ref)
          break
        }
      }
    }
  }

  return {
    convertedByRaw,
    rawByConverted,
    valueDiffers,
    unmatchedRaw: raw.filter((row) => !convertedByRaw.has(row.ref)).map((row) => row.ref),
    unmatchedConverted: converted
      .filter((row) => !rawByConverted.has(row.ref) && fromLabSource(row))
      .map((row) => row.ref),
    otherSource: converted.filter((row) => !fromLabSource(row)).map((row) => row.ref),
  }
}
