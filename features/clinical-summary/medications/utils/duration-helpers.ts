// Duration and Period Helper Functions
import type { DurationLike, PeriodLike } from '../types'

const UNIT_TO_DAYS: Record<string, number> = {
  d: 1, day: 1, days: 1, "24h": 1,
  wk: 7, w: 7, week: 7, weeks: 7,
  mo: 30, month: 30, months: 30,
  a: 365, y: 365, year: 365, years: 365,
  h: 1 / 24, hr: 1 / 24, hour: 1 / 24, hours: 1 / 24,
  min: 1 / (24 * 60), minute: 1 / (24 * 60), minutes: 1 / (24 * 60),
  s: 1 / (24 * 60 * 60), sec: 1 / (24 * 60 * 60), second: 1 / (24 * 60 * 60), seconds: 1 / (24 * 60 * 60),
}

export function convertDurationToDays(duration?: DurationLike): number | undefined {
  if (!duration?.value) return undefined
  const rawUnit = (duration.unit || duration.code || "").toLowerCase()
  if (!rawUnit) return undefined
  const factor = UNIT_TO_DAYS[rawUnit]
  if (!factor) return undefined
  const days = duration.value * factor
  if (!Number.isFinite(days) || days <= 0) return undefined
  return Math.round(days)
}

export function periodToDays(period?: PeriodLike): number | undefined {
  if (!period?.start || !period?.end) return undefined
  const startDate = new Date(period.start)
  const endDate = new Date(period.end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return undefined
  const diff = endDate.getTime() - startDate.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1
  if (!Number.isFinite(days) || days <= 0) return undefined
  return days
}

export function computeDurationDays({
  start,
  stop,
  expectedDuration,
  boundsDuration,
  boundsPeriod,
  validityPeriod,
}: {
  start?: string
  stop?: string
  expectedDuration?: DurationLike
  boundsDuration?: DurationLike
  boundsPeriod?: PeriodLike
  validityPeriod?: PeriodLike
}): number | undefined {
  return (
    convertDurationToDays(expectedDuration) ??
    convertDurationToDays(boundsDuration) ??
    periodToDays(boundsPeriod) ??
    periodToDays(validityPeriod) ??
    periodToDays(start && stop ? { start, end: stop } : undefined)
  )
}
