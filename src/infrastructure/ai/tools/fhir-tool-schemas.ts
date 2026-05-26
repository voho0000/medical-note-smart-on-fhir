// Shared Zod input schemas for FHIR query tools.
// Single source of truth — `fhir-tools.ts` imports from here so the LLM
// surface stays stable.
import { z } from 'zod'

// Re-usable parameter pieces ------------------------------------------------
const limitParam = z.number().int().positive().optional()
  .describe('Max records to return (default 50). Use small values to save tokens when sampling.')
const summarizeParam = z.boolean().optional()
  .describe('If true, return only counts + dates per row (no values / details). Use for token-light summaries.')

// Existing tools (with new optional knobs) ----------------------------------
export const conditionsSchema = z.object({
  category: z.string().optional().describe('Filter by category (e.g., "problem-list-item", "encounter-diagnosis")'),
  clinicalStatus: z.string().optional().describe('Filter by clinical status (e.g., "active", "resolved")'),
  limit: limitParam,
})

export const medicationsSchema = z.object({
  status: z.string().optional().describe('Filter by status (e.g., "active", "completed")'),
  chronic: z.boolean().optional().describe('Filter to chronic medications only (courseOfTherapyType=continuous, 慢箋)'),
  dateFrom: z.string().optional().describe('Filter by authoredOn from this date (YYYY-MM-DD)'),
  dateTo: z.string().optional().describe('Filter by authoredOn until this date (YYYY-MM-DD)'),
  limit: limitParam,
})

export const allergiesSchema = z.object({
  type: z.string().optional().describe('Filter by type (e.g., "allergy", "intolerance")'),
  severity: z.enum(['high', 'moderate', 'low']).optional()
    .describe('Filter by criticality level'),
})

export const observationsSchema = z.object({
  category: z.string().optional().describe('Filter by category (e.g., "laboratory", "vital-signs")'),
  code: z.string().optional().describe('Filter by LOINC code or observation type (exact match). Prefer `codeQuery` for fuzzy substring search.'),
  codeQuery: z.string().optional().describe('Case-insensitive substring search on observation name (e.g., "hba1c", "cholesterol"). Use this when LOINC is unknown.'),
  abnormalOnly: z.boolean().optional().describe('Return only values flagged abnormal (interpretation H/L/A/etc, or outside referenceRange)'),
  dateFrom: z.string().optional().describe('Filter observations from this date (YYYY-MM-DD)'),
  dateTo: z.string().optional().describe('Filter observations until this date (YYYY-MM-DD)'),
  limit: limitParam,
  summarize: summarizeParam,
})

export const proceduresSchema = z.object({
  status: z.string().optional().describe('Filter by status (e.g., "completed", "in-progress")'),
  dateFrom: z.string().optional().describe('Filter procedures from this date (YYYY-MM-DD)'),
  dateTo: z.string().optional().describe('Filter procedures until this date (YYYY-MM-DD)'),
  limit: limitParam,
})

export const encountersSchema = z.object({
  class: z.string().optional().describe('Filter by encounter class. Accepts BOTH HL7 v3 ActCode short codes (IMP / AMB / EMER / HH / VR / PHARM) AND friendly names (inpatient / outpatient / emergency / home / virtual / pharmacy). Both directions map automatically.'),
  department: z.string().optional().describe('Case-insensitive substring match on type/serviceType text (e.g., "眼科", "ophthalmology")'),
  institution: z.string().optional().describe('Case-insensitive substring match on serviceProvider/location (e.g., "VGH")'),
  dateFrom: z.string().optional().describe('Filter visits from this date (YYYY-MM-DD)'),
  dateTo: z.string().optional().describe('Filter visits until this date (YYYY-MM-DD)'),
  limit: limitParam,
  summarize: summarizeParam,
})

export const diagnosticReportsSchema = z.object({
  category: z.string().optional().describe('Filter by category (e.g., "LAB", "RAD")'),
  abnormalOnly: z.boolean().optional().describe('Return only reports containing at least one abnormal observation'),
  dateFrom: z.string().optional().describe('Filter reports from this date (YYYY-MM-DD)'),
  dateTo: z.string().optional().describe('Filter reports until this date (YYYY-MM-DD)'),
  limit: limitParam,
  summarize: summarizeParam,
})

export const immunizationsSchema = z.object({
  dateFrom: z.string().optional().describe('Filter immunizations from this date (YYYY-MM-DD)'),
  dateTo: z.string().optional().describe('Filter immunizations until this date (YYYY-MM-DD)'),
  limit: limitParam,
})

export const patientInfoSchema = z.object({})

// ----------------------------------------------------------------------------
// Phase 3 — cross-resource tools
// ----------------------------------------------------------------------------

export const encounterDetailsSchema = z.object({
  encounterId: z.string().describe('The encounter id returned by queryEncounters or getRecentVisits'),
})

export const activeMedicationsSchema = z.object({
  chronicOnly: z.boolean().optional().describe('Restrict to chronic prescriptions (慢箋) only'),
})

export const observationSearchSchema = z.object({
  query: z.string().describe('Case-insensitive substring of the lab/vital name (e.g., "HbA1c", "creatinine")'),
  withTrend: z.boolean().optional().describe('If true, return up to 10 most recent values for trending; otherwise return latest only'),
  limit: limitParam,
})

export const recentVisitsSchema = z.object({
  limit: z.number().int().positive().optional().describe('How many most-recent visits to return (default 10)'),
  type: z.enum(['outpatient', 'inpatient', 'emergency', 'pharmacy', 'home', 'virtual']).optional()
    .describe('Filter by visit type'),
})

// ----------------------------------------------------------------------------
// Phase 4 — discovery / metadata tools
// ----------------------------------------------------------------------------

export const overviewSchema = z.object({})
export const listDepartmentsSchema = z.object({})
export const listObservationCodesSchema = z.object({})
