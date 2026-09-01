// Shared FHIR Helper Functions
// Infrastructure layer utilities for working with FHIR resources

import type { CodeableConcept, Quantity } from '../types/fhir.types'

/**
 * Extract text from a CodeableConcept
 * Priority: text > coding[0].display > coding[0].code
 */
export function getCodeableConceptText(cc?: CodeableConcept | any): string {
  if (!cc) return "—"
  return cc.text || cc.coding?.[0]?.display || cc.coding?.[0]?.code || "—"
}

/**
 * Format a Quantity value with its unit
 */
export function formatQuantity(q?: Quantity): string {
  if (!q || q.value == null) return "—"
  const v = Number(q.value)
  const formatted = v.toLocaleString(undefined, {
    maximumFractionDigits: 1,
    minimumFractionDigits: v % 1 === 0 ? 0 : 1,
  })
  return `${formatted}${q.unit ? " " + q.unit : ""}`
}

/**
 * Format a date string to locale string.
 *
 * The date shown is the one the SOURCE wrote, never a re-dating of it into the
 * viewer's zone:
 *  - FHIR `date` / `dateTime` may be partial (YYYY, YYYY-MM) — those must NOT
 *    be padded into a full date, which would invent a day/month precision the
 *    source never claimed.
 *  - A bare `YYYY-MM-DD` is parsed by `new Date()` as UTC midnight, so
 *    `toLocaleDateString()` renders the previous day in negative timezones.
 *  - A `dateTime` carries the reporting facility's own offset
 *    ("2026-01-14T00:00:00+08:00" = the 14th at that hospital). Converting it
 *    to the viewer's zone moved the clinical event to a different DAY — a CI
 *    runner in UTC rendered that CT as 2026/1/13 — and it contradicted the
 *    app's own day grouping, which keys off the source's calendar date
 *    (`iso.slice(0, 10)` in lab-day-grouping / multi-region-grouping / lab
 *    pivots / report tab counts), so a card grouped under the 14th could be
 *    titled the 13th.
 *
 * So: read the calendar date out of the string and format only that, on the
 * local calendar. Timezone-independent by construction.
 */
export function formatDate(d?: string): string {
  if (!d) return ""
  const trimmed = d.trim()
  // Leading FHIR date, whether the value ends there (`date`) or a time part
  // follows (`dateTime` / `instant`).
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?(?=$|T)/.exec(trimmed)
  if (m) {
    const [, year, month, day] = m
    if (!month) return year                 // year only  → "2023"
    if (!day) return `${year}-${month}`     // year-month → "2023-05"
    // Full calendar date — build from parts (no timezone conversion).
    const dt = new Date(Number(year), Number(month) - 1, Number(day))
    return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString()
  }
  // Anything else (non-FHIR shapes) — parse and echo back verbatim if invalid.
  try {
    const dt = new Date(trimmed)
    return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString()
  } catch {
    return d
  }
}

/**
 * Clock time as the SOURCE wrote it, formatted for the active locale.
 *
 * Same contract as `formatDate`: "08:30 at the reporting facility" must not
 * become 00:30 because the reader is in UTC — a serial-lab time badge sitting
 * inside a collection-day card has to belong to that card's day. Returns ""
 * for date-only values, which have no time to show; inventing "08:00" from a
 * UTC midnight would be worse than showing nothing.
 */
export function formatSourceTime(d?: string): string {
  if (!d) return ""
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(d.trim())
  if (!m) return ""
  const [, year, month, day, hour, minute] = m
  // Rebuild the wall clock on the local calendar so Intl still applies the
  // locale's own 上午/AM conventions, without shifting the reading.
  const dt = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
  if (Number.isNaN(dt.getTime())) return ""
  return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * Format a date string to locale date and time string
 */
export function formatDateTime(d?: string, locale?: string): string {
  if (!d) return ""
  try {
    return new Date(d).toLocaleString(locale)
  } catch {
    return d
  }
}

/**
 * Get text from CodeableConcept or array of CodeableConcepts
 */
export function getConceptText(input?: CodeableConcept | CodeableConcept[]): string {
  if (!input) return "—"
  if (Array.isArray(input)) {
    return input.map(getCodeableConceptText).filter(Boolean).join(", ") || "—"
  }
  return getCodeableConceptText(input)
}

/**
 * Round a number to 1 decimal place
 */
export function round1(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : n
}

/**
 * Calculate age from birth date
 */
export function calculateAge(birthDate?: string): string {
  if (!birthDate) return "N/A"
  try {
    const birth = new Date(birthDate)
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    const monthDiff = today.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--
    }
    return `${birthDate.length < 10 ? '~' : ''}${age}`
  } catch (error) {
    console.error("Error calculating age:", error)
    return "N/A"
  }
}

/**
 * Format gender string
 */
export function formatGender(gender?: string): string {
  if (!gender) return "N/A"
  return gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase()
}

/**
 * Format error object to string
 */
export function formatError(error: unknown): string {
  if (typeof error === 'string') {
    return error
  }
  if (error && typeof error === 'object') {
    const err = error as { message?: unknown }
    if (typeof err.message === 'string') {
      return err.message
    }
    return JSON.stringify(error)
  }
  return String(error)
}
