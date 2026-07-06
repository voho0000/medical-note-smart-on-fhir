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
 * FHIR `date` / `dateTime` may be partial (YYYY, YYYY-MM) — those must NOT be
 * padded into a full date, which would invent a day/month precision the source
 * never claimed. A bare `YYYY-MM-DD` is also parsed by `new Date()` as UTC
 * midnight, so `toLocaleDateString()` can render the previous day in negative
 * timezones; format date-only values on the local calendar to avoid that shift.
 */
export function formatDate(d?: string): string {
  if (!d) return ""
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(d.trim())
  if (m) {
    const [, year, month, day] = m
    if (!month) return year                 // year only  → "2023"
    if (!day) return `${year}-${month}`     // year-month → "2023-05"
    // Full calendar date — build from parts (no timezone conversion).
    const dt = new Date(Number(year), Number(month) - 1, Number(day))
    return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString()
  }
  // dateTime / instant (carries a time + offset) — safe to parse directly.
  try {
    const dt = new Date(d)
    return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString()
  } catch {
    return d
  }
}

/**
 * Format a date string to locale date and time string
 */
export function formatDateTime(d?: string): string {
  if (!d) return ""
  try {
    return new Date(d).toLocaleString()
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
    return age.toString()
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
