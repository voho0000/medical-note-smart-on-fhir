// Local Bundle FHIR Tools — same tool names + schemas as the live FHIR tools,
// but execute against the in-memory parsed local bundle instead of a live
// SMART server. Returned data shape mirrors the live tools so the LLM sees
// identical behaviour regardless of data source.
import { tool } from 'ai'
import type { z } from 'zod'
import type { LocalBundleData } from '@/src/infrastructure/fhir/services/local-bundle.service'
import {
  conditionsSchema,
  medicationsSchema,
  allergiesSchema,
  observationsSchema,
  proceduresSchema,
  encountersSchema,
  diagnosticReportsSchema,
  immunizationsSchema,
  patientInfoSchema,
} from './fhir-tool-schemas'
import {
  isWithinDateRange,
  matchCategoryCoding,
  matchClinicalStatus,
  matchStatus,
  isChronicByCourseOfTherapy,
  matchChronic,
  matchEncounterClass,
  matchDiagnosticReportCategory,
  matchAllergyType,
} from './_filter-helpers'

function pickName(concept: any): string | undefined {
  return concept?.text || concept?.coding?.[0]?.display
}

function notFoundMessage(noun: string, dateFrom?: string, dateTo?: string): string {
  if (dateFrom || dateTo) {
    return `在指定時間範圍內（${dateFrom || '開始'} 至 ${dateTo || '現在'}）沒有找到${noun}`
  }
  return `沒有找到${noun}`
}

export function createLocalFhirTools(getData: () => LocalBundleData | null) {
  return {
    queryPatientInfo: tool({
      description: 'Query patient demographic information (ID, gender, birth date for age calculation) from the locally-imported FHIR bundle.',
      inputSchema: patientInfoSchema,
      execute: async () => {
        const data = getData()
        const p = data?.patient
        if (!p) {
          return { success: false, summary: 'Patient not found in local bundle', data: null }
        }
        let age: number | null = null
        if (p.birthDate) {
          const birth = new Date(p.birthDate)
          if (!Number.isNaN(birth.getTime())) {
            const today = new Date()
            age = today.getFullYear() - birth.getFullYear()
            const m = today.getMonth() - birth.getMonth()
            if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
          }
        }
        return {
          success: true,
          summary: 'Patient demographics retrieved from local bundle',
          data: {
            id: p.id,
            gender: p.gender,
            birthDate: p.birthDate,
            age,
            _note: 'Local bundle data — patient name is not surfaced',
          },
        }
      },
    }),

    queryConditions: tool({
      description: 'Query patient conditions/diagnoses from the locally-imported FHIR bundle. Use this to get information about patient diagnoses, problems, or medical conditions.',
      inputSchema: conditionsSchema,
      execute: async ({ category, clinicalStatus }: z.infer<typeof conditionsSchema>) => {
        const list = getData()?.collection.conditions ?? []
        const filtered = list.filter((c: any) =>
          matchCategoryCoding(c.category, category) &&
          matchClinicalStatus(c.clinicalStatus, clinicalStatus)
        )
        return {
          success: true,
          summary: `Found ${filtered.length} Condition record(s) in local bundle`,
          count: filtered.length,
          data: filtered.map((c: any) => ({
            code: pickName(c.code),
            clinicalStatus: typeof c.clinicalStatus === 'string'
              ? c.clinicalStatus
              : c.clinicalStatus?.coding?.[0]?.code,
            recordedDate: c.recordedDate,
          })),
        }
      },
    }),

    queryMedications: tool({
      description: 'Query patient medications from the locally-imported FHIR bundle. Use this to get current or past medications. Supports `chronic` to filter to 慢箋 (continuous courseOfTherapyType) and date range.',
      inputSchema: medicationsSchema,
      execute: async ({ status, chronic, dateFrom, dateTo }: z.infer<typeof medicationsSchema>) => {
        const list = getData()?.collection.medications ?? []
        let filtered = list.filter((m: any) =>
          matchStatus(m.status, status) &&
          matchChronic(m.courseOfTherapyType, chronic)
        )
        if (dateFrom || dateTo) {
          filtered = filtered.filter((m: any) => isWithinDateRange(m.authoredOn, dateFrom, dateTo))
        }
        return {
          success: true,
          summary: `Found ${filtered.length} MedicationRequest record(s) in local bundle`,
          count: filtered.length,
          data: filtered.map((m: any) => ({
            medication: pickName(m.medicationCodeableConcept),
            status: m.status,
            authoredOn: m.authoredOn,
            dosageInstruction: m.dosageInstruction?.[0]?.text,
            chronic: isChronicByCourseOfTherapy(m.courseOfTherapyType),
          })),
        }
      },
    }),

    queryAllergies: tool({
      description: 'Query patient allergies and intolerances from the locally-imported FHIR bundle.',
      inputSchema: allergiesSchema,
      execute: async ({ type }: z.infer<typeof allergiesSchema>) => {
        const list = getData()?.collection.allergies ?? []
        const filtered = list.filter((a: any) => matchAllergyType(a.type, type))
        return {
          success: true,
          summary: `Found ${filtered.length} AllergyIntolerance record(s) in local bundle`,
          count: filtered.length,
          data: filtered.map((a: any) => ({
            substance: pickName(a.code),
            criticality: a.criticality,
            type: a.type,
            recordedDate: a.recordedDate,
          })),
        }
      },
    }),

    queryObservations: tool({
      description: 'Query patient observations (lab results, vital signs) from the locally-imported FHIR bundle. Supports date range filtering.',
      inputSchema: observationsSchema,
      execute: async ({ category, code, dateFrom, dateTo }: z.infer<typeof observationsSchema>) => {
        const data = getData()
        const observations = data?.collection.observations ?? []
        const vitals = data?.collection.vitalSigns ?? []
        // Union — vitals are also typed as Observation in the live API.
        const seen = new Set<string>()
        const list = [...observations, ...vitals].filter((o: any) => {
          const id = o.id
          if (id && seen.has(id)) return false
          if (id) seen.add(id)
          return true
        })

        let filtered = list.filter((o: any) => {
          if (!matchCategoryCoding(o.category, category)) return false
          if (code) {
            const codes: string[] = (o.code?.coding ?? []).map((c: any) => c?.code).filter(Boolean)
            if (!codes.includes(code) && pickName(o.code) !== code) return false
          }
          return true
        })

        if (dateFrom || dateTo) {
          filtered = filtered.filter((o: any) => isWithinDateRange(o.effectiveDateTime, dateFrom, dateTo))
        }

        const summary = filtered.length > 0
          ? `Found ${filtered.length} Observation record(s) in local bundle`
          : notFoundMessage('檢驗數據', dateFrom, dateTo)

        return {
          success: true,
          summary,
          count: filtered.length,
          dateRange: { from: dateFrom, to: dateTo },
          data: filtered.slice(0, 50).map((o: any) => ({
            code: pickName(o.code),
            value: o.valueQuantity?.value,
            unit: o.valueQuantity?.unit,
            effectiveDateTime: o.effectiveDateTime,
            status: o.status,
          })),
        }
      },
    }),

    queryProcedures: tool({
      description: 'Query patient procedures from the locally-imported FHIR bundle.',
      inputSchema: proceduresSchema,
      execute: async ({ status }: z.infer<typeof proceduresSchema>) => {
        const list = getData()?.collection.procedures ?? []
        const filtered = list.filter((p: any) => matchStatus(p.status, status))
        return {
          success: true,
          summary: `Found ${filtered.length} Procedure record(s) in local bundle`,
          count: filtered.length,
          data: filtered.map((p: any) => ({
            procedure: pickName(p.code),
            status: p.status,
            performedDateTime: p.performedDateTime || p.performedPeriod?.start,
          })),
        }
      },
    }),

    queryEncounters: tool({
      description: 'Query patient encounters (visits, admissions) from the locally-imported FHIR bundle.',
      inputSchema: encountersSchema,
      execute: async ({ class: encounterClass }: z.infer<typeof encountersSchema>) => {
        const list = getData()?.collection.encounters ?? []
        const filtered = list.filter((e: any) => matchEncounterClass(e.class, encounterClass))
        return {
          success: true,
          summary: `Found ${filtered.length} Encounter record(s) in local bundle`,
          count: filtered.length,
          data: filtered.map((e: any) => ({
            class: e.class?.code || e.class?.coding?.[0]?.code,
            type: pickName(e.type?.[0]),
            period: e.period,
            status: e.status,
          })),
        }
      },
    }),

    queryDiagnosticReports: tool({
      description: 'Query patient diagnostic reports (lab panels, radiology reports) from the locally-imported FHIR bundle. This is the PRIMARY tool for querying lab test results like Basic Metabolic Panel, Lipid Panel, CBC, etc. Use this instead of queryObservations for lab results.',
      inputSchema: diagnosticReportsSchema,
      execute: async ({ category, dateFrom, dateTo }: z.infer<typeof diagnosticReportsSchema>) => {
        const list = getData()?.collection.diagnosticReports ?? []
        let filtered = list.filter((r: any) => matchDiagnosticReportCategory(r.category, category))
        if (dateFrom || dateTo) {
          filtered = filtered.filter((r: any) => isWithinDateRange(r.effectiveDateTime, dateFrom, dateTo))
        }

        const summary = filtered.length > 0
          ? `Found ${filtered.length} DiagnosticReport record(s) in local bundle`
          : notFoundMessage('檢驗報告', dateFrom, dateTo)

        return {
          success: true,
          summary,
          count: filtered.length,
          dateRange: { from: dateFrom, to: dateTo },
          data: filtered.slice(0, 10).map((r: any) => ({
            reportName: pickName(r.code),
            effectiveDateTime: r.effectiveDateTime,
            status: r.status,
            conclusion: r.conclusion,
            // LocalBundleService.parse() already expanded observation refs onto
            // diagnosticReports as `_observations`, so we don't need to walk
            // refs here like the live tool does.
            results: (r._observations ?? []).map((obs: any) => ({
              name: pickName(obs.code) || 'Unknown',
              value: obs.valueQuantity?.value ?? obs.valueString ?? obs.valueCodeableConcept?.text,
              unit: obs.valueQuantity?.unit || '',
            })),
          })),
        }
      },
    }),

    queryImmunizations: tool({
      description: 'Query patient immunization (vaccination) records from the locally-imported FHIR bundle. Use this for preventive vaccines (e.g. COVID-19, influenza, pneumococcal). Supports date range filtering.',
      inputSchema: immunizationsSchema,
      execute: async ({ dateFrom, dateTo }: z.infer<typeof immunizationsSchema>) => {
        const list = getData()?.collection.immunizations ?? []
        let filtered = list
        if (dateFrom || dateTo) {
          filtered = filtered.filter((imm: any) => isWithinDateRange(imm.occurrenceDateTime, dateFrom, dateTo))
        }
        return {
          success: true,
          summary: `Found ${filtered.length} Immunization record(s) in local bundle`,
          count: filtered.length,
          dateRange: { from: dateFrom, to: dateTo },
          data: filtered.map((imm: any) => ({
            vaccine: pickName(imm.vaccineCode),
            code: imm.vaccineCode?.coding?.[0]?.code,
            status: imm.status,
            occurrenceDateTime: imm.occurrenceDateTime,
            performer: imm.performer?.[0]?.actor?.display,
            lotNumber: imm.lotNumber,
            manufacturer: imm.manufacturer?.display,
          })),
        }
      },
    }),
  }
}
