// Date Filtering Utilities
// Shared utilities for time range filtering across categories
// Following DRY (Don't Repeat Yourself) principle

/**
 * Check if a date string is within the specified time range
 * @param dateString - ISO date string to check
 * @param range - Time range identifier ('1w', '1m', '3m', '6m', '1y', 'all')
 * @returns true if date is within range or range is 'all'
 */
export function isWithinTimeRange(dateString: string | undefined, range: string): boolean {
  if (!dateString || range === 'all') return true
  
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return false
  
  const now = new Date()
  const diffInMs = now.getTime() - date.getTime()
  const diffInDays = diffInMs / (1000 * 60 * 60 * 24)
  
  switch (range) {
    case '24h': return diffInDays <= 1
    case '3d': return diffInDays <= 3
    case '1w': return diffInDays <= 7
    case '1m': return diffInDays <= 30
    case '3m': return diffInDays <= 90
    case '6m': return diffInDays <= 180
    case '1y': return diffInDays <= 365
    case '3y': return diffInDays <= 365 * 3
    case '5y': return diffInDays <= 365 * 5
    default: return true
  }
}

/**
 * Get the most recent date from multiple possible date fields
 * @param dates - Array of possible date strings
 * @returns The most recent date string, or undefined if none exist
 */
export function getMostRecentDate(...dates: (string | undefined)[]): string | undefined {
  const validDates = dates.filter(Boolean) as string[]
  if (validDates.length === 0) return undefined

  return validDates.sort((a, b) => b.localeCompare(a))[0]
}

// ── Event-based time range: 上次就醫以來 ────────────────────────────────────
// Wall-clock windows (3m/6m) are unstable across patients — a stable patient
// seen every 6 months has an empty "last 3 months", while an ICU patient has
// hundreds of rows. 'sinceLastVisit' anchors the window to the patient's own
// visit cadence instead: everything since the PREVIOUS distinct visit day, so
// the AI sees the current episode plus the visit before it, no matter how far
// apart visits are.
export const SINCE_LAST_VISIT = 'sinceLastVisit'

type EncounterLike = { period?: { start?: string } }

/**
 * Day-level cutoff for 'sinceLastVisit': the start day of the patient's
 * previous distinct visit (2nd most recent visit day). With a single visit day
 * on record, that day; with none, undefined (no window).
 */
export function resolveSinceLastVisitCutoff(
  encounters?: EncounterLike[] | null,
): string | undefined {
  const days = [
    ...new Set(
      (encounters ?? [])
        .map((e) => e?.period?.start?.slice(0, 10))
        .filter(Boolean) as string[],
    ),
  ].sort((a, b) => b.localeCompare(a))
  if (days.length === 0) return undefined
  return days[1] ?? days[0]
}

/**
 * Build a date predicate for a time-range filter value, resolving the
 * 'sinceLastVisit' cutoff ONCE (not per item). Falls back to the plain
 * wall-clock ranges for every other value. Mirrors isWithinTimeRange's
 * undated-item behavior (undated → included).
 */
export function makeTimeRangeTest(
  range: string,
  clinicalData?: { encounters?: EncounterLike[] } | null,
): (dateString: string | undefined) => boolean {
  if (range === SINCE_LAST_VISIT) {
    const cutoff = resolveSinceLastVisitCutoff(clinicalData?.encounters)
    if (!cutoff) return () => true
    return (dateString) => !dateString || dateString.slice(0, 10) >= cutoff
  }
  return (dateString) => isWithinTimeRange(dateString, range)
}
