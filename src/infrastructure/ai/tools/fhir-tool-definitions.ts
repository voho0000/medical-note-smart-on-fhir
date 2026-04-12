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
      description: 'Query the current patient\'s conditions and diagnoses from the FHIR server. Returns the patient\'s medical conditions, problems, and diagnosis history.',
      inputSchema: conditionsSchema,
    }),

    queryMedications: tool({
      description: 'Query the current patient\'s medication records from the FHIR server. Returns current and past medications, including dosages and administration details.',
      inputSchema: medicationsSchema,
    }),

    queryAllergies: tool({
      description: 'Query the current patient\'s allergies and intolerances from the FHIR server. Returns known allergies, adverse reactions, and intolerances.',
      inputSchema: allergiesSchema,
    }),

    queryObservations: tool({
      description: 'Query the current patient\'s clinical observations from the FHIR server. Returns lab results, vital signs, and other clinical measurements.',
      inputSchema: observationsSchema,
    }),

    queryProcedures: tool({
      description: 'Query the current patient\'s procedure history from the FHIR server. Returns surgical procedures, treatments, and clinical interventions performed on this patient.',
      inputSchema: proceduresSchema,
    }),

    queryEncounters: tool({
      description: 'Query the current patient\'s encounter history from the FHIR server. Returns hospital visits, appointments, admissions, and discharge information.',
      inputSchema: encountersSchema,
    }),
  }
}
