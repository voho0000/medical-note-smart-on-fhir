// Shared Zod input schemas for FHIR query tools.
// Single source of truth — used by both the live FHIR tools
// (`fhir-tools.ts`) and the local-bundle tools (`local-fhir-tools.ts`)
// so the LLM-facing tool surface stays identical regardless of data source.
import { z } from 'zod'

export const conditionsSchema = z.object({
  category: z.string().optional().describe('Filter by category (e.g., "problem-list-item", "encounter-diagnosis")'),
  clinicalStatus: z.string().optional().describe('Filter by clinical status (e.g., "active", "resolved")'),
})

export const medicationsSchema = z.object({
  status: z.string().optional().describe('Filter by status (e.g., "active", "completed")'),
  chronic: z.boolean().optional().describe('Filter to chronic medications only (courseOfTherapyType=continuous, 慢箋)'),
  dateFrom: z.string().optional().describe('Filter by authoredOn from this date (YYYY-MM-DD)'),
  dateTo: z.string().optional().describe('Filter by authoredOn until this date (YYYY-MM-DD)'),
})

export const allergiesSchema = z.object({
  type: z.string().optional().describe('Filter by type (e.g., "allergy", "intolerance")'),
})

export const observationsSchema = z.object({
  category: z.string().optional().describe('Filter by category (e.g., "laboratory", "vital-signs")'),
  code: z.string().optional().describe('Filter by LOINC code or observation type'),
  dateFrom: z.string().optional().describe('Filter observations from this date (YYYY-MM-DD format, e.g., "2021-01-01")'),
  dateTo: z.string().optional().describe('Filter observations until this date (YYYY-MM-DD format, e.g., "2021-12-31")'),
})

export const proceduresSchema = z.object({
  status: z.string().optional().describe('Filter by status (e.g., "completed", "in-progress")'),
})

export const encountersSchema = z.object({
  class: z.string().optional().describe('Filter by encounter class (e.g., "inpatient", "outpatient", "emergency")'),
})

export const diagnosticReportsSchema = z.object({
  category: z.string().optional().describe('Filter by category (e.g., "LAB", "RAD")'),
  dateFrom: z.string().optional().describe('Filter reports from this date (YYYY-MM-DD format)'),
  dateTo: z.string().optional().describe('Filter reports until this date (YYYY-MM-DD format)'),
})

export const immunizationsSchema = z.object({
  dateFrom: z.string().optional().describe('Filter immunizations from this date (YYYY-MM-DD)'),
  dateTo: z.string().optional().describe('Filter immunizations until this date (YYYY-MM-DD)'),
})

export const patientInfoSchema = z.object({})
