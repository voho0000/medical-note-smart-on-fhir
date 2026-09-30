// Pairs a report's MediCloud raw rows with its converted rows, for the
// developer viewer. Most converted Observations carry no pointer back to
// their source row, so the pairing is a best match on what both sides show:
// the same day, the same test, and — when values were attached — the same
// result. Unpaired raw rows are the ones the conversion dropped (or turned
// into something unrecognisable); unpaired converted rows have no raw row
// that explains them.
//
// It must never hide a conversion error by pairing the wrong rows, so:
// - the test is decided by its name first — through the same canonical key
//   the cumulative report uses ("HGB", "Hb 血色素" → HB; "SEG",
//   "Neutrophil 嗜中性多核球" → NEU); an order code shared by several
//   tests (08011C covers WBC, RBC, PLT …) only pairs when it is the one row
//   carrying that code on that day, on both sides;
// - a result is its comparator, its numbers and its qualitative text
//   together ("<0.5" ≠ "0.5", "Reactive(0.18)" ≠ "Nonreactive(0.18)");
// - a pair whose values differ is made only when it is the single candidate
//   left, and is flagged.
import { canonicalTestKeyFromString } from '@voho0000/clinical-lab-normalization/canonical'
import type { LabDataReportRawRow, LabDataReportRow } from '../types'

export interface RawPairing {
  /** raw ref → converted ref */
  convertedByRaw: Map<number, number>
  /** converted ref → raw ref */
  rawByConverted: Map<number, number>
  /** Raw refs paired on day and test although the values differ — itself a
   *  sign of a conversion error (unit, decimal, comparator, wording). */
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

// ── Results ──────────────────────────────────────────────────────────────

/** What a result says: comparator, every number, and its words. */
interface ResultKey {
  comparator: string
  numbers: number[]
  text: string
}

// Every way a source writes "at most" / "at least" (NFKC folds the full-
// width forms ＜ ＞ ＝ into ASCII, but not ≤ ≥ ≦ ≧ ⩽ ⩾).
const COMPARATORS: Record<string, string> = {
  '<': '<', '>': '>', '=': '',
  '<=': '<=', '=<': '<=', '≤': '<=', '≦': '<=', '⩽': '<=',
  '>=': '>=', '=>': '>=', '≥': '>=', '≧': '>=', '⩾': '>=',
}
const LEADING_COMPARATOR = /^\s*(<=|=<|>=|=>|≤|≦|⩽|≥|≧|⩾|<|>|=)/
const NUMBER = /(?<![\d.])-?\d+(?:\.\d+)?/g

function resultKeyOfText(value: string, units: readonly (string | undefined)[]): ResultKey {
  let text = value.normalize('NFKC').trim()
  // A unit already stated in the unit field is not part of the result.
  for (const unit of units) {
    const plain = unit?.normalize('NFKC').trim()
    if (plain) text = text.split(plain).join(' ')
  }
  let comparator = ''
  const lead = text.match(LEADING_COMPARATOR)
  if (lead) {
    comparator = COMPARATORS[lead[1]]
    text = text.slice(lead[0].length)
  }
  const numbers = (text.match(NUMBER) ?? []).map(Number)
  // The words: letters (any script) and plus signs ("1+", "(+)") survive;
  // digits, spaces, brackets and separators do not.
  const words = text.replace(NUMBER, ' ').toLowerCase().replace(/[^\p{L}+]/gu, '')
  return { comparator, numbers, text: words }
}

function rawResultKey(row: LabDataReportRawRow, converted: LabDataReportRow): ResultKey | undefined {
  const value = row.results.assay_value ?? row.results.assaY_VALUE
  if (value === undefined) return undefined
  if (typeof value === 'number') return { comparator: '', numbers: [value], text: '' }
  return resultKeyOfText(value, [row.fields.unit_data, converted.unit])
}

function convertedResultKey(row: LabDataReportRow): ResultKey | undefined {
  const value = row.value
  switch (value.kind) {
    case 'quantity':
      return value.value === undefined
        ? undefined
        : { comparator: COMPARATORS[value.comparator ?? '='] ?? value.comparator ?? '', numbers: [value.value], text: '' }
    case 'range':
      return value.low === undefined && value.high === undefined
        ? undefined
        : { comparator: '', numbers: [value.low, value.high].filter((n): n is number => n !== undefined), text: '' }
    case 'string':
      return value.value === undefined ? undefined : resultKeyOfText(value.value, [row.unit])
    case 'coded': {
      const text = value.text ?? value.code
      return text === undefined ? undefined : resultKeyOfText(text, [row.unit])
    }
    default:
      return undefined
  }
}

const sameResult = (a: ResultKey, b: ResultKey) =>
  a.comparator === b.comparator
  && a.text === b.text
  && a.numbers.length === b.numbers.length
  && a.numbers.every((n, i) => Math.abs(n - b.numbers[i]) < 1e-9)

// ── Tests ────────────────────────────────────────────────────────────────

/** A name as written and as the app's canonical analyte key. */
function nameKeys(name: string | undefined): string[] {
  if (!name?.trim()) return []
  return [normalize(name), normalize(canonicalTestKeyFromString(name))].filter(Boolean)
}

function rawNames(row: LabDataReportRawRow): string[] {
  return nameKeys(row.fields.assay_item_name ?? row.fields.assaY_NAME)
}

function convertedNames(row: LabDataReportRow): string[] {
  return [
    ...nameKeys(row.code.text),
    normalize(row.app.testKey),
    normalize(row.app.column),
    ...row.code.codings.map((coding) => normalize(coding.display)),
  ].filter(Boolean)
}

const isWordChar = (char: string | undefined) => !!char && /[\p{L}\p{N}]/u.test(char)

/** `needle` appears in `hay` as a whole word ("testosterone" in
 *  "…(testosterone(eia/lia))", but "hb" not in "hba1c"). */
function containsWord(hay: string, needle: string): boolean {
  if (needle.length < 2) return false
  for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + 1)) {
    if (!isWordChar(hay[at - 1]) && !isWordChar(hay[at + needle.length])) return true
  }
  return false
}

function sameName(raw: LabDataReportRawRow, converted: LabDataReportRow): boolean {
  const names = rawNames(raw)
  if (names.length === 0) return false
  const others = convertedNames(converted)
  return others.some((other) => names.some((name) => other === name || containsWord(other, name) || containsWord(name, other)))
}

const orderCodeOf = (raw: LabDataReportRawRow) => raw.fields.order_code?.trim() || undefined
const hasCode = (row: LabDataReportRow, code: string) => row.code.codings.some((coding) => coding.code === code)

const SOURCE_MODULE = 'source-module:'

/** The converted row came from IMUE0060, or does not say where it came from. */
function fromLabSource(row: LabDataReportRow): boolean {
  const sourceModule = row.sourceTags.find((tag) => tag.startsWith(SOURCE_MODULE))
  return !sourceModule || sourceModule.slice(SOURCE_MODULE.length).toLowerCase() === 'imue0060'
}

function rawDays(row: LabDataReportRawRow): number[] {
  return [...new Set(Object.values(row.dates).map((date) => date!.day))]
}

export function pairRawRows(converted: readonly LabDataReportRow[], raw: readonly LabDataReportRawRow[]): RawPairing {
  const convertedByRaw = new Map<number, number>()
  const rawByConverted = new Map<number, number>()
  const valueDiffers = new Set<number>()

  const byDay = new Map<number, LabDataReportRow[]>()
  for (const row of converted) {
    if (row.day === null || !fromLabSource(row)) continue
    byDay.set(row.day, [...(byDay.get(row.day) ?? []), row])
  }
  // How many raw rows carry an order code on a day — a code only identifies
  // a test when it is the only one of its kind that day.
  const rawPerDayCode = new Map<string, number>()
  for (const row of raw) {
    const code = orderCodeOf(row)
    if (!code) continue
    for (const day of rawDays(row)) rawPerDayCode.set(`${day}|${code}`, (rawPerDayCode.get(`${day}|${code}`) ?? 0) + 1)
  }

  /** Still-free converted rows on this day that are this raw row's test. */
  const candidates = (rawRow: LabDataReportRawRow, day: number): LabDataReportRow[] => {
    const sameDay = byDay.get(day) ?? []
    const named = sameDay.filter((row) => sameName(rawRow, row))
    if (named.length > 0) return named.filter((row) => !rawByConverted.has(row.ref))
    const code = orderCodeOf(rawRow)
    if (!code || rawPerDayCode.get(`${day}|${code}`) !== 1) return []
    const coded = sameDay.filter((row) => hasCode(row, code))
    return coded.length === 1 && !rawByConverted.has(coded[0].ref) ? coded : []
  }

  const pair = (rawRow: LabDataReportRawRow, row: LabDataReportRow, differs: boolean) => {
    convertedByRaw.set(rawRow.ref, row.ref)
    rawByConverted.set(row.ref, rawRow.ref)
    if (differs) valueDiffers.add(rawRow.ref)
  }

  // Equal results first, so that a row with no attached value never takes
  // one a later raw row matches exactly; then rows where a value is
  // missing; last, a lone candidate whose value differs (flagged).
  for (const pass of ['equal', 'unknown', 'differs'] as const) {
    for (const rawRow of raw) {
      if (convertedByRaw.has(rawRow.ref)) continue
      for (const day of rawDays(rawRow)) {
        const found = candidates(rawRow, day)
        if (pass === 'differs') {
          if (found.length === 1) {
            pair(rawRow, found[0], true)
            break
          }
          continue
        }
        const match = found.find((row) => {
          const rawKey = rawResultKey(rawRow, row)
          const convertedKey = convertedResultKey(row)
          if (pass === 'equal') return !!rawKey && !!convertedKey && sameResult(rawKey, convertedKey)
          return !rawKey || !convertedKey
        })
        if (match) {
          pair(rawRow, match, false)
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
