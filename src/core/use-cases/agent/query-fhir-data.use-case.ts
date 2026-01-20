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
      // Patient resource uses direct ID path, other resources use patient parameter
      let query: string
      if (resourceType === 'Patient') {
        query = `${resourceType}/${patientId}`
      } else {
        query = `${resourceType}?patient=${patientId}`
      }
      
      // Add default parameters based on resource type
      const defaultParams = this.getDefaultParameters(resourceType)
      const mergedParams = { ...defaultParams, ...parameters }
      
      // Only add parameters if not querying Patient by ID
      if (resourceType !== 'Patient') {
        for (const [key, value] of Object.entries(mergedParams)) {
          query += `&${key}=${value}`
        }
      }

      // Execute FHIR query
      const response = await fhirClient.request(query)
      
      // Anonymize patient data by removing names
      const anonymizedResponse = this.anonymizeResponse(response, resourceType)
      
      // Extract and summarize results
      const entries = anonymizedResponse.entry || []
      const count = entries.length
      
      return {
        success: true,
        data: anonymizedResponse,
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

  /**
   * Anonymize FHIR response by removing patient names
   * Keeps: id, gender, birthDate (for age calculation)
   * Removes: name, telecom, address, contact, photo
   */
  private anonymizeResponse(response: any, resourceType: FhirResourceType): any {
    if (!response) {
      return response
    }

    // Handle direct Patient resource (Patient/{id} query)
    if (resourceType === 'Patient' && response.resourceType === 'Patient') {
      return {
        resourceType: response.resourceType,
        id: response.id,
        gender: response.gender,
        birthDate: response.birthDate,
        identifier: response.identifier,
        _anonymized: true
      }
    }

    // Handle Bundle responses (search queries)
    if (!response.entry) {
      return response
    }

    const anonymizedResponse = { ...response }
    anonymizedResponse.entry = response.entry.map((entry: any) => {
      const resource = entry.resource
      
      // For Patient resources, remove identifying information
      if (resource?.resourceType === 'Patient') {
        // Explicitly keep only allowed fields
        return {
          ...entry,
          resource: {
            resourceType: resource.resourceType,
            id: resource.id,
            gender: resource.gender,
            birthDate: resource.birthDate,
            identifier: resource.identifier,
            _anonymized: true
          }
        }
      }
      
      // For other resources, check if they contain patient references with names
      if (resource?.subject?.display) {
        const anonymizedResource = { ...resource }
        anonymizedResource.subject = {
          ...resource.subject,
          display: `Patient/${resource.subject.reference?.split('/')[1] || 'Unknown'}`
        }
        return { ...entry, resource: anonymizedResource }
      }
      
      return entry
    })

    return anonymizedResponse
  }
}
