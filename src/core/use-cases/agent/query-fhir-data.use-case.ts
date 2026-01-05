// Query FHIR Data Use Case
import type { FHIRClient } from '@/src/infrastructure/fhir/client/fhir-client.service'

export type FhirResourceType = 
  | 'Condition' 
  | 'MedicationRequest' 
  | 'AllergyIntolerance' 
  | 'Observation' 
  | 'DiagnosticReport' 
  | 'Procedure' 
  | 'Encounter'
  | 'Patient'

export interface QueryFhirDataInput {
  resourceType: FhirResourceType
  patientId: string
  parameters?: Record<string, string>
}

export interface QueryFhirDataOutput {
  success: boolean
  data?: any
  error?: string
  summary?: string
}

export class QueryFhirDataUseCase {
  async execute(input: QueryFhirDataInput, fhirClient: FHIRClient): Promise<QueryFhirDataOutput> {
    try {
      const { resourceType, patientId, parameters = {} } = input

      // Build query string
      let query = `${resourceType}?patient=${patientId}`
      
      // Add default parameters based on resource type
      const defaultParams = this.getDefaultParameters(resourceType)
      const mergedParams = { ...defaultParams, ...parameters }
      
      for (const [key, value] of Object.entries(mergedParams)) {
        query += `&${key}=${value}`
      }

      // Execute FHIR query
      const response = await fhirClient.request(query)
      
      // Extract and summarize results
      const entries = response.entry || []
      const count = entries.length
      
      return {
        success: true,
        data: response,
        summary: `Found ${count} ${resourceType} record(s) for patient ${patientId}`
      }
    } catch (error) {
      console.error('FHIR query error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        summary: `Failed to query ${input.resourceType} data`
      }
    }
  }

  private getDefaultParameters(resourceType: FhirResourceType): Record<string, string> {
    const defaults: Record<FhirResourceType, Record<string, string>> = {
      'Condition': { '_count': '100', '_sort': '-recorded-date' },
      'MedicationRequest': { '_count': '100', '_sort': '-authoredon' },
      'AllergyIntolerance': { '_count': '100' },
      'Observation': { '_count': '200', '_sort': '-date' },
      'DiagnosticReport': { '_count': '50', '_sort': '-date' },
      'Procedure': { '_count': '100', '_sort': '-date' },
      'Encounter': { '_count': '100', '_sort': '-date' },
      'Patient': {}
    }
    
    return defaults[resourceType] || {}
  }
}
