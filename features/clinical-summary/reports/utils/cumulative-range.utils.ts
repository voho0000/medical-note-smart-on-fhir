// 顯示範圍 for the stacked cumulative report: how many date rows a category
// shows before the clinician asks for the rest.
//
// Two different questions hide behind one control:
//   • 最新一筆 / 最新三筆 — "what does this panel look like now?" Counted PER
//     CATEGORY, because an ICU patient may have 40 CBCs and 2 lipid panels in
//     the same admission; a shared date window would leave 血脂 empty.
//   • 最近三個月 / 半年 / 一年 — "what happened over this period?" A real
//     calendar window, identical across categories.
//
// Everything works on the pivot's own "YYYY-MM-DD" collection-date strings.
// They are LOCAL calendar days as reported by the source, so the cutoff is
// built from local date parts and compared as a string — going through
// Date.getTime() would re-interpret the day in UTC and drop (or keep) an extra
// row depending on the browser's timezone.

// The value domain (ids + default) belongs to the store that persists it;
// application code may not import from features, so the dependency runs this
// way round and everything is re-exported here for the report components.
import {
  CUMULATIVE_RANGE_IDS,
  DEFAULT_CUMULATIVE_RANGE,
  type CumulativeRangeId,
} from '@/src/application/stores/cumulative-report-prefs.store'

export {
  CUMULATIVE_RANGE_IDS,
  DEFAULT_CUMULATIVE_RANGE,
  type CumulativeRangeId,
}

interface LatestRange {
  kind: 'latest'
  count: number
}
interface WindowRange {
  kind: 'window'
  months: number
}

const RANGE_SPECS: Record<CumulativeRangeId, LatestRange | WindowRange> = {
  latest1: { kind: 'latest', count: 1 },
  latest3: { kind: 'latest', count: 3 },
  months3: { kind: 'window', months: 3 },
  months6: { kind: 'window', months: 6 },
  year1: { kind: 'window', months: 12 },
}

export function isCumulativeRangeId(value: unknown): value is CumulativeRangeId {
  return typeof value === 'string'
    && (CUMULATIVE_RANGE_IDS as string[]).includes(value)
}

/** `latest*` ranges are "N most recent rows"; the others are calendar windows. */
export function cumulativeRangeLatestCount(range: CumulativeRangeId): number | null {
  const spec = RANGE_SPECS[range]
  return spec?.kind === 'latest' ? spec.count : null
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/**
 * Inclusive lower bound for a calendar window, as "YYYY-MM-DD" in the viewer's
 * own timezone. Month subtraction clamps to the end of a shorter month (a
 * 3-month window from 05-31 starts 02-28/29, never spills into March) — the
 * standard Date behaviour of overflowing to March 3rd would silently hide two
 * days of results.
 */
export function cumulativeRangeCutoff(
  range: CumulativeRangeId,
  today: Date = new Date(),
): string | null {
  const spec = RANGE_SPECS[range]
  if (!spec || spec.kind !== 'window') return null
  const year = today.getFullYear()
  const month = today.getMonth()
  const day = today.getDate()
  const targetMonthIndex = month - spec.months
  const targetYear = year + Math.floor(targetMonthIndex / 12)
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12
  // Day 0 of the NEXT month = last day of the target month.
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate()
  const clampedDay = Math.min(day, lastDayOfTargetMonth)
  return `${targetYear}-${pad(targetMonth + 1)}-${pad(clampedDay)}`
}

/**
 * Apply a range to one category's date column.
 *
 * `dates` arrives newest-first from the pivot builder; the result keeps that
 * order and is always a prefix of the input, so the caller can compute the
 * hidden remainder as `dates.length - visible.length`.
 */
export function filterDatesByCumulativeRange(
  dates: string[],
  range: CumulativeRangeId,
  today: Date = new Date(),
): string[] {
  const latestCount = cumulativeRangeLatestCount(range)
  if (latestCount !== null) return dates.slice(0, latestCount)
  const cutoff = cumulativeRangeCutoff(range, today)
  if (!cutoff) return dates
  // String comparison is valid for zero-padded ISO calendar days and avoids a
  // timezone round-trip. Dates shorter than 10 chars (partial source dates) are
  // compared on the prefix they have, which is the best available answer.
  return dates.filter((date) => date.slice(0, 10) >= cutoff)
}
