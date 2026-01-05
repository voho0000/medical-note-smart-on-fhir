// FHIR Tool Definitions (without execute functions - for server-side use)
import { tool } from 'ai'
import { z } from 'zod'

const conditionsSchema = z.object({
  category: z.string().optional().describe('Filter by category (e.g., "problem-list-item", "encounter-diagnosis")'),
  clinicalStatus: z.string().optional().describe('Filter by clinical status (e.g., "active", "resolved")'),
})

const medicationsSchema = z.object({
  status: z.string().optional().describe('Filter by status (e.g., "active", "completed")'),
})

const allergiesSchema = z.object({
  type: z.string().optional().describe('Filter by type (e.g., "allergy", "intolerance")'),
})

const observationsSchema = z.object({
  category: z.string().optional().describe('Filter by category (e.g., "laboratory", "vital-signs")'),
  code: z.string().optional().describe('Filter by LOINC code or observation type'),
})

const proceduresSchema = z.object({
  status: z.string().optional().describe('Filter by status (e.g., "completed", "in-progress")'),
})

const encountersSchema = z.object({
  class: z.string().optional().describe('Filter by encounter class (e.g., "inpatient", "outpatient", "emergency")'),
})

export function createFhirToolDefinitions() {
  return {
    queryConditions: tool({
      description: 'Query patient conditions/diagnoses from FHIR server. Use this to get information about patient diagnoses, problems, or medical conditions.',
      inputSchema: conditionsSchema,
    }),

    queryMedications: tool({
      description: 'Query patient medications from FHIR server. Use this to get information about current or past medications.',
      inputSchema: medicationsSchema,
    }),

    queryAllergies: tool({
      description: 'Query patient allergies and intolerances from FHIR server. Use this to get information about allergies, adverse reactions, or intolerances.',
      inputSchema: allergiesSchema,
    }),

    queryObservations: tool({
      description: 'Query patient observations (lab results, vital signs) from FHIR server. Use this to get lab test results, vital signs, or other clinical observations.',
      inputSchema: observationsSchema,
    }),

    queryProcedures: tool({
      description: 'Query patient procedures from FHIR server. Use this to get information about surgical procedures, treatments, or interventions performed.',
      inputSchema: proceduresSchema,
    }),

    queryEncounters: tool({
      description: 'Query patient encounters (visits, admissions) from FHIR server. Use this to get information about hospital visits, appointments, or admissions.',
      inputSchema: encountersSchema,
    }),
  }
}
