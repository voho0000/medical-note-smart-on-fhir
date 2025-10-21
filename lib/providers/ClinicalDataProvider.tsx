// lib/providers/ClinicalDataProvider.tsx
"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { usePatient } from './PatientProvider'
import FHIR from 'fhirclient'

type FHIRClient = {
  request: (query: string) => Promise<any>
}

type FHIRCondition = {
  id?: string
  code?: {
    text?: string
    coding?: Array<{
      code?: string
      display?: string
    }>
  }
  category?: Array<{
    coding?: Array<{
      code?: string
      display?: string
    }>
  }>
  clinicalStatus?: {
    coding?: Array<{
      code?: string
      display?: string
    }>
  }
  verificationStatus?: {
    coding?: Array<{
      code?: string
      display?: string
    }>
  }
  recordedDate?: string
}

type FHIRMedication = {
  id?: string
  medicationCodeableConcept?: {
    text?: string
    coding?: Array<{
      code?: string
      display?: string
    }>
  }
  status?: string
  intent?: string
  authoredOn?: string
  dosageInstruction?: Array<{
    text?: string
    route?: {
      text?: string
      coding?: Array<{
        code?: string
        display?: string
      }>
    }
    timing?: {
      repeat?: {
        frequency?: number
        period?: number
        periodUnit?: string
      }
    }
    doseAndRate?: Array<{
      doseQuantity?: {
        value?: number
        unit?: string
      }
      doseRange?: {
        low?: {
          value?: number
          unit?: string
        }
        high?: {
          value?: number
          unit?: string
        }
      }
    }>
  }>
}

export type FHIRObservation = {
  id?: string
  resourceType?: string
  code?: {
    coding?: Array<{
      code?: string
      system?: string
      display?: string
    }>
    text?: string
  }
  valueQuantity?: {
    value?: number
    unit?: string
  }
  component?: Array<{
    code?: {
      coding?: Array<{
        code?: string
        system?: string
        display?: string
      }>
    }
    valueQuantity?: {
      value?: number
      unit?: string
    }
  }>
  effectiveDateTime?: string
  status?: string
  category?: Array<{
    coding?: Array<{
      code?: string
      system?: string
      display?: string
    }>
    text?: string
  }>
}

type FHIRAllergyIntolerance = {
  id?: string
  code?: {
    text?: string
    coding?: Array<{
      code?: string
      display?: string
    }>
  }
  clinicalStatus?: {
    coding?: Array<{
      code?: string
      display?: string
    }>
  }
  verificationStatus?: {
    coding?: Array<{
      code?: string
      display?: string
    }>
  }
  criticality?: string
  reaction?: Array<{
    manifestation?: Array<{
      text?: string
      coding?: Array<{
        code?: string
        display?: string
      }>
    }>
    severity?: string
    description?: string
  }>
  recordedDate?: string
}

export interface ClinicalData {
  diagnoses: FHIRCondition[]
  medications: FHIRMedication[]
  allergies: FHIRAllergyIntolerance[]
  vitals: FHIRObservation[]
  isLoading: boolean
  error: Error | null
  vitalSigns: FHIRObservation[]
  diagnosticReports: any[]
  observations: any[]
}

const ClinicalDataContext = createContext<ClinicalData | undefined>(undefined)

export function useClinicalData() {
  const context = useContext(ClinicalDataContext)
  if (context === undefined) {
    throw new Error('useClinicalData must be used within a ClinicalDataProvider')
  }
  return context
}

async function fetchConditions(client: FHIRClient, patientId: string): Promise<FHIRCondition[]> {
  // First try with recorded-date, fallback to no sort if that fails
  try {
    const response = await client.request(`Condition?patient=${patientId}&_sort=-recorded-date&_count=100`)
    return response.entry?.map((entry: any) => ({
      id: entry.resource?.id,
      code: entry.resource?.code,
      clinicalStatus: entry.resource?.clinicalStatus,
      verificationStatus: entry.resource?.verificationStatus,
      recordedDate: entry.resource?.recordedDate || entry.resource?.dateRecorded,
    })) || []
  } catch (error) {
    // If sorting fails, try without sort
    console.warn('Failed to sort conditions by recorded-date, trying without sort', error)
    const response = await client.request(`Condition?patient=${patientId}&_count=100`)
    return response.entry?.map((entry: any) => ({
      id: entry.resource?.id,
      code: entry.resource?.code,
      clinicalStatus: entry.resource?.clinicalStatus,
      verificationStatus: entry.resource?.verificationStatus,
      recordedDate: entry.resource?.recordedDate || entry.resource?.dateRecorded,
    })) || []
  }
}

export const ClinicalDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {

async function fetchMedications(client: FHIRClient, patientId: string): Promise<FHIRMedication[]> {
  const response = await client.request(`MedicationRequest?patient=${patientId}&_sort=-authoredon&_count=100`)
  return response.entry?.map((entry: any) => ({
    id: entry.resource?.id,
    medicationCodeableConcept: entry.resource?.medicationCodeableConcept,
    status: entry.resource?.status,
    intent: entry.resource?.intent,
    authoredOn: entry.resource?.authoredOn,
    dosageInstruction: entry.resource?.dosageInstruction,
  })) || []
}

async function fetchAllergies(client: FHIRClient, patientId: string): Promise<FHIRAllergyIntolerance[]> {
  try {
    console.log('Fetching allergies for patient:', patientId)
    // Try with a simpler query first
    const url = `AllergyIntolerance?patient=${patientId}&_count=100`
    console.log('Fetching from URL:', url)
    
    const response = await client.request(url)
    console.log('Received response:', response)
    
    if (!response.entry) {
      console.debug('No allergy data found in response')
      return []
    }
    
    // Process the response
    const allergies = response.entry.map((entry: any) => ({
      id: entry.resource?.id,
      code: entry.resource?.code,
      clinicalStatus: entry.resource?.clinicalStatus,
      verificationStatus: entry.resource?.verificationStatus,
      criticality: entry.resource?.criticality,
      reaction: entry.resource?.reaction,
      recordedDate: entry.resource?.recordedDate || entry.resource?.recorded,
    }))
    
    console.log(`Found ${allergies.length} allergies`)
    return allergies
  } catch (error: unknown) {
    console.error('Error in fetchAllergies:', error)
    if (error && typeof error === 'object' && 'response' in error) {
      const err = error as { response?: { status?: number; statusText?: string; data?: unknown } }
      console.error('Response error:', {
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: err.response?.data
      })
    }
    return []
  }
}

async function fetchVitals(client: FHIRClient, patientId: string): Promise<FHIRObservation[]> {
  const response = await client.request(`Observation?patient=${patientId}&category=vital-signs&_sort=-date&_count=200`)
  return response.entry?.map((entry: any) => entry.resource) || []
}

  const { patient, loading: isPatientLoading, error: patientError } = usePatient()
  const [state, setState] = useState<Omit<ClinicalData, 'isLoading' | 'error'>>({
    diagnoses: [],
    medications: [],
    allergies: [],
    vitals: [],
    vitalSigns: [],
    diagnosticReports: [],
    observations: []
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  
  // Get the FHIR client
  const getFhirClient = useCallback(async () => {
    try {
      const client = await FHIR.oauth2.ready()
      return client
    } catch (err) {
      console.error('Failed to initialize FHIR client:', err)
      throw err
    }
  }, [])

  const fetchVitalSigns = useCallback(async (client: FHIRClient, patientId: string): Promise<FHIRObservation[]> => {
    try {
      const response = await client.request(
        `Observation?patient=${patientId}&category=vital-signs&_count=100&_sort=-date`,
      )
      return response.entry?.map((entry: any) => entry.resource) || []
    } catch (err) {
      console.error('Error fetching vital signs:', err)
      setError(err instanceof Error ? err : new Error('Failed to fetch vital signs'))
      return []
    }
  }, [])

  const fetchDiagnosticReports = useCallback(async (client: FHIRClient, patientId: string): Promise<any[]> => {
  try {
    // Fetch diagnostic reports with included observations
    const response = await client.request(
      `DiagnosticReport?patient=${patientId}&_count=50&_sort=-date&_include=DiagnosticReport:result&_include:iterate=Observation:has-member`
    );
    
    // Group entries by resource type
    const entries = response.entry || [];
    const reports = entries
      .filter((e: any) => e.resource?.resourceType === 'DiagnosticReport')
      .map((e: any) => e.resource);
      
    const observations = entries
      .filter((e: any) => e.resource?.resourceType === 'Observation')
      .map((e: any) => e.resource);
      
    // Create a map of observations by ID for easy lookup
    const obsMap = new Map(observations.map((obs: any) => [obs.id, obs]));
    
    // Process each report to include its observations
    return reports.map((report: any) => {
      // Get observation references from the report
      const resultRefs = report.result || [];
      const resultIds = resultRefs
        .map((ref: any) => ref.reference?.split('/').pop())
        .filter(Boolean);
      
      // Get the actual observation objects
      const reportObservations = resultIds
        .map((id: string) => obsMap.get(id))
        .filter(Boolean);
      
      // Expand any observations that have members
      const expandedObservations = reportObservations.flatMap((obs: any) => {
        if (!obs?.hasMember?.length) return [obs];
        
        const members = obs.hasMember
          .map((m: any) => {
            const memberId = m.reference?.split('/').pop();
            return memberId ? obsMap.get(memberId) : null;
          })
          .filter(Boolean);
          
        return [obs, ...members];
      });
      
      // Return the report with its observations
      return {
        ...report,
        _observations: expandedObservations
      };
    });
  } catch (err) {
    console.error('Error fetching diagnostic reports:', err);
    setError(err instanceof Error ? err : new Error('Failed to fetch diagnostic reports'));
    return [];
  }
}, []);

async function fetchObservations(client: FHIRClient, patientId: string): Promise<FHIRObservation[]> {
  try {
    // 先抓 laboratory（多數生化/血液學都在這）
    let response = await client.request(
      `Observation?patient=${patientId}&category=laboratory&_count=200&_sort=-date`,
    )

    // 如果伺服器沒有標 category 或你拿到空結果，改抓所有 Observation 再自行過濾
    if (!response?.entry?.length) {
      response = await client.request(
        `Observation?patient=${patientId}&_count=200&_sort=-date`,
      )
    }

    return response.entry?.map((entry: any) => entry.resource) || []
  } catch (err) {
    console.error('Error fetching observations:', err)
    setError(err instanceof Error ? err : new Error('Failed to fetch observations'))
    return []
  }
}

  useEffect(() => {
    async function loadData() {
      if (isPatientLoading || !patient?.id) return

      try {
        setIsLoading(true)
        setError(null)
        
        // Get the FHIR client
        const client = await getFhirClient()
        
        // Fetch all data in parallel
        const [diagnoses, medications, allergies, vitals, diagnosticReports, observations] = await Promise.all([
          fetchConditions(client, patient.id),
          fetchMedications(client, patient.id),
          fetchAllergies(client, patient.id),
          fetchVitals(client, patient.id),
          fetchDiagnosticReports(client, patient.id),
          fetchObservations(client, patient.id)
        ])

        setState(prev => ({
          ...prev,
          diagnoses,
          medications,
          allergies,
          vitals,
          vitalSigns: vitals,
          diagnosticReports,
          observations
        }))
      } catch (err) {
        console.error('Error loading clinical data:', err)
        setError(err instanceof Error ? err : new Error('Failed to load clinical data'))
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [getFhirClient, isPatientLoading, patient?.id])

  // Combine loading and error states
  const combinedIsLoading = isPatientLoading || isLoading 
  const combinedError = patientError ? new Error(patientError) : error

  const value = useMemo(() => ({
    ...state,
    isLoading: combinedIsLoading,
    error: combinedError,
  }), [state, combinedIsLoading, combinedError])

  return (
    <ClinicalDataContext.Provider value={value}>
      {children}
    </ClinicalDataContext.Provider>
  )
}
