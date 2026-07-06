// Proactive Safety Alerts — the FIXED, structured shape the AI must return so
// the UI can render固定卡片 instead of free-text. Pure AI generation (the model
// reasons over the clinical context) but constrained to this schema; we Zod-
// validate the parsed JSON so a malformed response is rejected, not rendered.
import { z } from 'zod'

export const SAFETY_SEVERITIES = ['high', 'medium', 'low'] as const
export type SafetySeverity = (typeof SAFETY_SEVERITIES)[number]

export const SAFETY_CATEGORIES = [
  'renal',
  'bleeding',
  'critical-lab',
  'duplicate',
  'allergy',
  'monitoring',
  'other',
] as const
export type SafetyCategory = (typeof SAFETY_CATEGORIES)[number]

// Lenient on category (the model may emit something off-list → coerce to
// 'other') but strict on severity (drives the badge colour).
// Size caps CLAMP (slice/truncate) instead of rejecting — verbose models
// (Claude Haiku) exceed them with good content, and one oversize field must
// not void a whole safety scan (see medical-summary.entity.ts, 2026-07).
const trimTo = (max: number) => (s: string) => (s.length > max ? s.slice(0, max) : s)
export const SafetyAlertSchema = z.object({
  severity: z.enum(SAFETY_SEVERITIES),
  title: z.string().min(1).transform(trimTo(80)),
  detail: z.string().min(1).transform(trimTo(400)),
  evidence: z.array(z.string()).optional().default([]).transform((a) => a.slice(0, 10)),
  // Source-list keys (e.g. "L3", "M2") for the bundle records this alert is
  // based on — resolved app-side to clickable citations that navigate the left
  // panel to the raw FHIR resource (parity with the summary/decision cards).
  sources: z.array(z.string()).optional().default([]).transform((a) => a.slice(0, 10)),
  category: z.string().optional(),
  recommendation: z.string().transform(trimTo(400)).optional(),
})
export type SafetyAlertInput = z.infer<typeof SafetyAlertSchema>

export const SafetyScanResultSchema = z.object({
  scannedCount: z.number().int().nonnegative().optional().default(0),
  alerts: z.array(SafetyAlertSchema).default([]).transform((a) => a.slice(0, 20)),
})
export type SafetyScanResultInput = z.infer<typeof SafetyScanResultSchema>

/** A validated alert with a stable id + normalised category for the UI. */
export interface SafetyAlert extends SafetyAlertInput {
  id: string
  category: SafetyCategory
}

export interface SafetyScanResult {
  scannedCount: number
  alerts: SafetyAlert[]
}

export function normaliseCategory(raw?: string): SafetyCategory {
  const c = (raw ?? '').toLowerCase().trim()
  return (SAFETY_CATEGORIES as readonly string[]).includes(c) ? (c as SafetyCategory) : 'other'
}

/** Sort rank so the UI can order high → medium → low deterministically,
 *  independent of the order the model happened to emit. */
export const SEVERITY_RANK: Record<SafetySeverity, number> = { high: 0, medium: 1, low: 2 }

/** Count alerts by severity — drives the section-nav breakdown and tiering. */
export function countBySeverity(alerts: SafetyAlert[]): Record<SafetySeverity, number> {
  const counts: Record<SafetySeverity, number> = { high: 0, medium: 0, low: 0 }
  for (const a of alerts) counts[a.severity] += 1
  return counts
}
