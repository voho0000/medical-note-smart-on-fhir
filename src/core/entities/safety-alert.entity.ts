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
export const SafetyAlertSchema = z.object({
  severity: z.enum(SAFETY_SEVERITIES),
  title: z.string().min(1).max(80),
  detail: z.string().min(1).max(400),
  evidence: z.array(z.string()).max(10).optional().default([]),
  category: z.string().optional(),
  recommendation: z.string().max(400).optional(),
})
export type SafetyAlertInput = z.infer<typeof SafetyAlertSchema>

export const SafetyScanResultSchema = z.object({
  scannedCount: z.number().int().nonnegative().optional().default(0),
  alerts: z.array(SafetyAlertSchema).max(20).default([]),
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
