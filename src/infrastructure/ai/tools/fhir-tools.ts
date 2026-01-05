// FHIR Tools for AI Agent
import { tool } from 'ai'
import { z } from 'zod'
import type { FHIRClient } from '@/src/infrastructure/fhir/client/fhir-client.service'
import { QueryFhirDataUseCase } from '@/src/core/use-cases/agent/query-fhir-data.use-case'

const queryFhirDataUseCase = new QueryFhirDataUseCase()

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
  dateFrom: z.string().optional().describe('Filter observations from this date (YYYY-MM-DD format, e.g., "2021-01-01")'),
  dateTo: z.string().optional().describe('Filter observations until this date (YYYY-MM-DD format, e.g., "2021-12-31")'),
})

const proceduresSchema = z.object({
  status: z.string().optional().describe('Filter by status (e.g., "completed", "in-progress")'),
})

const encountersSchema = z.object({
  class: z.string().optional().describe('Filter by encounter class (e.g., "inpatient", "outpatient", "emergency")'),
})

const diagnosticReportsSchema = z.object({
  category: z.string().optional().describe('Filter by category (e.g., "LAB", "RAD")'),
  dateFrom: z.string().optional().describe('Filter reports from this date (YYYY-MM-DD format)'),
  dateTo: z.string().optional().describe('Filter reports until this date (YYYY-MM-DD format)'),
})

export function createFhirTools(fhirClient: FHIRClient, patientId: string) {
  return {
    queryConditions: tool({
      description: 'Query patient conditions/diagnoses from FHIR server. Use this to get information about patient diagnoses, problems, or medical conditions.',
      inputSchema: conditionsSchema,
      execute: async ({ category, clinicalStatus }: z.infer<typeof conditionsSchema>) => {
        console.log('[Tool] queryConditions started', { patientId, category, clinicalStatus })
        try {
          const parameters: Record<string, string> = {}
          if (category) parameters.category = category
          if (clinicalStatus) parameters['clinical-status'] = clinicalStatus
          
          const result = await queryFhirDataUseCase.execute(
            { resourceType: 'Condition', patientId, parameters },
            fhirClient
          )
          
          console.log('[Tool] queryConditions completed', { 
            success: result.success, 
            count: result.data?.entry?.length || 0 
          })
          
          return {
            success: result.success,
            summary: result.summary,
            count: result.data?.entry?.length || 0,
            data: result.data?.entry?.map((e: any) => ({
              code: e.resource?.code?.text || e.resource?.code?.coding?.[0]?.display,
              clinicalStatus: e.resource?.clinicalStatus?.coding?.[0]?.code,
              recordedDate: e.resource?.recordedDate,
            })) || []
          }
        } catch (error) {
          console.error('[Tool] queryConditions error:', error)
          return {
            success: false,
            summary: `Error querying conditions: ${error instanceof Error ? error.message : 'Unknown error'}`,
            count: 0,
            data: []
          }
        }
      },
    }),

    queryMedications: tool({
      description: 'Query patient medications from FHIR server. Use this to get information about current or past medications.',
      inputSchema: medicationsSchema,
      execute: async ({ status }: z.infer<typeof medicationsSchema>) => {
        const parameters: Record<string, string> = {}
        if (status) parameters.status = status
        
        const result = await queryFhirDataUseCase.execute(
          { resourceType: 'MedicationRequest', patientId, parameters },
          fhirClient
        )
        
        return {
          success: result.success,
          summary: result.summary,
          count: result.data?.entry?.length || 0,
          data: result.data?.entry?.map((e: any) => ({
            medication: e.resource?.medicationCodeableConcept?.text || 
                       e.resource?.medicationCodeableConcept?.coding?.[0]?.display,
            status: e.resource?.status,
            authoredOn: e.resource?.authoredOn,
            dosageInstruction: e.resource?.dosageInstruction?.[0]?.text,
          })) || []
        }
      },
    }),

    queryAllergies: tool({
      description: 'Query patient allergies and intolerances from FHIR server. Use this to get information about allergies, adverse reactions, or intolerances.',
      inputSchema: allergiesSchema,
      execute: async ({ type }: z.infer<typeof allergiesSchema>) => {
        const parameters: Record<string, string> = {}
        if (type) parameters.type = type
        
        const result = await queryFhirDataUseCase.execute(
          { resourceType: 'AllergyIntolerance', patientId, parameters },
          fhirClient
        )
        
        return {
          success: result.success,
          summary: result.summary,
          count: result.data?.entry?.length || 0,
          data: result.data?.entry?.map((e: any) => ({
            substance: e.resource?.code?.text || e.resource?.code?.coding?.[0]?.display,
            criticality: e.resource?.criticality,
            type: e.resource?.type,
            recordedDate: e.resource?.recordedDate,
          })) || []
        }
      },
    }),

    queryObservations: tool({
      description: 'Query patient observations (lab results, vital signs) from FHIR server. Use this to get lab test results, vital signs, or other clinical observations. Supports date range filtering.',
      inputSchema: observationsSchema,
      execute: async ({ category, code, dateFrom, dateTo }: z.infer<typeof observationsSchema>) => {
        console.log('[Tool] queryObservations started', { patientId, category, code, dateFrom, dateTo })
        try {
          const parameters: Record<string, string> = {}
          if (category) parameters.category = category
          if (code) parameters.code = code
          if (dateFrom) parameters.date = `ge${dateFrom}`
          if (dateTo) parameters.date = parameters.date ? `${parameters.date}&date=le${dateTo}` : `le${dateTo}`
          
          const result = await queryFhirDataUseCase.execute(
            { resourceType: 'Observation', patientId, parameters },
            fhirClient
          )
          
          // 如果有時間範圍過濾，在客戶端再次過濾確保準確
          let entries = result.data?.entry || []
          if (dateFrom || dateTo) {
            entries = entries.filter((e: any) => {
              const date = e.resource?.effectiveDateTime
              if (!date) return false
              if (dateFrom && date < dateFrom) return false
              if (dateTo && date > dateTo + 'T23:59:59') return false
              return true
            })
          }
          
          console.log('[Tool] queryObservations completed', { 
            success: result.success, 
            totalCount: result.data?.entry?.length || 0,
            filteredCount: entries.length,
            dateRange: { dateFrom, dateTo }
          })
          
          const noDataMessage = dateFrom || dateTo 
            ? `在指定時間範圍內（${dateFrom || '開始'} 至 ${dateTo || '現在'}）沒有找到檢驗數據`
            : '沒有找到檢驗數據'
          
          return {
            success: result.success,
            summary: entries.length > 0 ? result.summary : noDataMessage,
            count: entries.length,
            dateRange: { from: dateFrom, to: dateTo },
            data: entries.slice(0, 50).map((e: any) => ({
              code: e.resource?.code?.text || e.resource?.code?.coding?.[0]?.display,
              value: e.resource?.valueQuantity?.value,
              unit: e.resource?.valueQuantity?.unit,
              effectiveDateTime: e.resource?.effectiveDateTime,
              status: e.resource?.status,
            }))
          }
        } catch (error) {
          console.error('[Tool] queryObservations error:', error)
          return {
            success: false,
            summary: `Error querying observations: ${error instanceof Error ? error.message : 'Unknown error'}`,
            count: 0,
            data: []
          }
        }
      },
    }),

    queryProcedures: tool({
      description: 'Query patient procedures from FHIR server. Use this to get information about surgical procedures, treatments, or interventions performed.',
      inputSchema: proceduresSchema,
      execute: async ({ status }: z.infer<typeof proceduresSchema>) => {
        const parameters: Record<string, string> = {}
        if (status) parameters.status = status
        
        const result = await queryFhirDataUseCase.execute(
          { resourceType: 'Procedure', patientId, parameters },
          fhirClient
        )
        
        return {
          success: result.success,
          summary: result.summary,
          count: result.data?.entry?.length || 0,
          data: result.data?.entry?.map((e: any) => ({
            procedure: e.resource?.code?.text || e.resource?.code?.coding?.[0]?.display,
            status: e.resource?.status,
            performedDateTime: e.resource?.performedDateTime || e.resource?.performedPeriod?.start,
          })) || []
        }
      },
    }),

    queryEncounters: tool({
      description: 'Query patient encounters (visits, admissions) from FHIR server. Use this to get information about hospital visits, appointments, or admissions.',
      inputSchema: encountersSchema,
      execute: async ({ class: encounterClass }: z.infer<typeof encountersSchema>) => {
        const parameters: Record<string, string> = {}
        if (encounterClass) parameters.class = encounterClass
        
        const result = await queryFhirDataUseCase.execute(
          { resourceType: 'Encounter', patientId, parameters },
          fhirClient
        )
        
        return {
          success: result.success,
          summary: result.summary,
          count: result.data?.entry?.length || 0,
          data: result.data?.entry?.map((e: any) => ({
            class: e.resource?.class?.code || e.resource?.class?.coding?.[0]?.code,
            type: e.resource?.type?.[0]?.text || e.resource?.type?.[0]?.coding?.[0]?.display,
            period: e.resource?.period,
            status: e.resource?.status,
          })) || []
        }
      },
    }),

    queryDiagnosticReports: tool({
      description: 'Query patient diagnostic reports (lab panels, radiology reports) from FHIR server. This is the PRIMARY tool for querying lab test results like Basic Metabolic Panel, Lipid Panel, CBC, etc. Use this instead of queryObservations for lab results. Returns detailed test results.',
      inputSchema: diagnosticReportsSchema,
      execute: async ({ category, dateFrom, dateTo }: z.infer<typeof diagnosticReportsSchema>) => {
        console.log('[Tool] queryDiagnosticReports started', { patientId, category, dateFrom, dateTo })
        try {
          const parameters: Record<string, string> = {}
          if (category) parameters.category = category
          
          // 查詢 DiagnosticReport
          const result = await queryFhirDataUseCase.execute(
            { resourceType: 'DiagnosticReport', patientId, parameters },
            fhirClient
          )
          
          // 如果有時間範圍過濾，在客戶端過濾
          let entries = result.data?.entry || []
          if (dateFrom || dateTo) {
            entries = entries.filter((e: any) => {
              const date = e.resource?.effectiveDateTime
              if (!date) return false
              if (dateFrom && date < dateFrom) return false
              if (dateTo && date > dateTo + 'T23:59:59') return false
              return true
            })
          }
          
          // 查詢所有相關的 Observations 來獲取檢驗細項
          const observationsResult = await queryFhirDataUseCase.execute(
            { resourceType: 'Observation', patientId, parameters: {} },
            fhirClient
          )
          const allObservations = observationsResult.data?.entry || []
          
          // 建立 Observation ID -> Observation 的映射
          const observationMap = new Map<string, any>()
          allObservations.forEach((obs: any) => {
            if (obs.resource?.id) {
              observationMap.set(obs.resource.id, obs.resource)
            }
          })
          
          console.log('[Tool] queryDiagnosticReports completed', { 
            success: result.success, 
            totalCount: result.data?.entry?.length || 0,
            filteredCount: entries.length,
            observationsCount: allObservations.length,
            dateRange: { dateFrom, dateTo }
          })
          
          const noDataMessage = dateFrom || dateTo 
            ? `在指定時間範圍內（${dateFrom || '開始'} 至 ${dateTo || '現在'}）沒有找到檢驗報告`
            : '沒有找到檢驗報告'
          
          return {
            success: result.success,
            summary: entries.length > 0 ? result.summary : noDataMessage,
            count: entries.length,
            dateRange: { from: dateFrom, to: dateTo },
            data: entries.slice(0, 10).map((e: any) => {
              // 獲取這個報告的所有檢驗細項
              const resultRefs = e.resource?.result || []
              const observations = resultRefs.map((ref: any) => {
                const obsId = ref.reference?.split('/').pop()
                const obs = obsId ? observationMap.get(obsId) : null
                if (!obs) return null
                return {
                  name: obs.code?.text || obs.code?.coding?.[0]?.display || 'Unknown',
                  value: obs.valueQuantity?.value ?? obs.valueString ?? obs.valueCodeableConcept?.text,
                  unit: obs.valueQuantity?.unit || '',
                }
              }).filter(Boolean)
              
              return {
                reportName: e.resource?.code?.text || e.resource?.code?.coding?.[0]?.display,
                effectiveDateTime: e.resource?.effectiveDateTime,
                status: e.resource?.status,
                conclusion: e.resource?.conclusion,
                results: observations,
              }
            })
          }
        } catch (error) {
          console.error('[Tool] queryDiagnosticReports error:', error)
          return {
            success: false,
            summary: `Error querying diagnostic reports: ${error instanceof Error ? error.message : 'Unknown error'}`,
            count: 0,
            data: []
          }
        }
      },
    }),
  }
}
