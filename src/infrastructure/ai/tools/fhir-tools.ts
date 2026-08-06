// Unified FHIR Tools for AI Agent
//
// Single implementation backing BOTH SMART-live mode and local-bundle mode.
// Both modes populate the React Query / LocalBundleService cache with a
// `ClinicalDataCollection`; the tool layer reads from that snapshot.
//
// Every tool response goes through `scrubPii()` so cloud LLMs never see
// patient ID, DOB, or provider names.
import { tool } from 'ai'
import type { z } from 'zod'
import type { PatientEntity } from '@/src/core/entities/patient.entity'
import type {
  ClinicalDataCollection,
  ClinicalDataQueryKey,
  ClinicalDataQueryStatus,
} from '@/src/core/entities/clinical-data.entity'
import {
  conditionsSchema,
  medicationsSchema,
  allergiesSchema,
  observationsSchema,
  proceduresSchema,
  encountersSchema,
  diagnosticReportsSchema,
  labResultsByCategorySchema,
  imagingRecordsSchema,
  immunizationsSchema,
  patientInfoSchema,
  healthSummarySnapshotSchema,
  encounterDetailsSchema,
  activeMedicationsSchema,
  observationSearchSchema,
  recentVisitsSchema,
  overviewSchema,
  listDepartmentsSchema,
  listObservationCodesSchema,
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
  matchAllergySeverity,
  matchSubstring,
  isAbnormalObservation,
  applyLimit,
} from './_filter-helpers'
import { scrubPii } from './_scrub-pii'
import { buildPatientTextLiterals } from '@/src/shared/utils/pii-text-scrub'
import { pickAiMedicationName } from '@/src/shared/utils/fhir-display-helpers'
import { referenceId } from '@/src/core/utils/observation-selectors'
import {
  imagingStudyModalityText,
  imagingStudyTitle,
} from '@/src/shared/utils/imaging-study.utils'
import { decodeBase64, stripHtmlToText } from '@/src/core/utils/clinical-documents.utils'
import {
  LAB_CATEGORIES,
  categorizeObservation,
  compareTestsByPreferred,
} from '@/src/shared/utils/lab-categories'
import {
  getAnalyteCanonicalKey,
  getAnalyteLabel,
} from '@/src/shared/utils/lab-normalize'
import { expandObservationValues } from '@/src/core/utils/observation-value.utils'
import {
  getAuditedReferenceRangeBounds,
  getInterpretationTag,
} from '@/src/shared/utils/interpretation-helpers'

export interface AgentDataSource {
  patient: PatientEntity | null
  collection: ClinicalDataCollection | null
}

// ── helpers ────────────────────────────────────────────────────────────────

function pickName(concept: any): string | undefined {
  return concept?.text || concept?.coding?.[0]?.display
}

function conceptSearchText(concept: any): string {
  return [
    concept?.text,
    ...((concept?.coding ?? []).flatMap((coding: any) => [
      coding?.code,
      coding?.display,
    ])),
  ].filter(Boolean).join(' ')
}

function loincOf(concept: any): string | undefined {
  return (concept?.coding ?? []).find((c: any) => /loinc/i.test(c.system || ''))?.code
}

function notFoundMessage(noun: string, dateFrom?: string, dateTo?: string): string {
  if (dateFrom || dateTo) {
    return `在指定時間範圍內（${dateFrom || '開始'} 至 ${dateTo || '現在'}）沒有找到${noun}`
  }
  return `沒有找到${noun}`
}

function observationDate(observation: any): string | undefined {
  return observation?.effectiveDateTime
    || observation?.effectivePeriod?.start
    || observation?.issued
}

function diagnosticReportDate(report: any): string | undefined {
  return report?.effectiveDateTime
    || report?.effectivePeriod?.start
    || report?.issued
}

function paginationMeta(totalCount: number, returnedCount: number) {
  return {
    totalCount,
    returnedCount,
    truncated: returnedCount < totalCount,
    hasMore: returnedCount < totalCount,
  }
}

const COMPLETE_QUERY_STATES = new Set(['ok', 'empty'])

interface SafeQueryIssue {
  resourceType: string
  state: ClinicalDataQueryStatus['state']
  httpStatus?: number
  message?: string
}

function queryIssuesFor(
  collection: ClinicalDataCollection,
  keys: ClinicalDataQueryKey[],
): SafeQueryIssue[] {
  return keys.flatMap((key) => {
    const status = collection.resourceQueryStatus?.[key]
    if (!status || COMPLETE_QUERY_STATES.has(status.state)) return []
    return [{
      resourceType: status.resourceType,
      state: status.state,
      httpStatus: status.httpStatus,
      message: status.message,
    }]
  })
}

function unavailableQueryResult(
  collection: ClinicalDataCollection | null,
  keys: ClinicalDataQueryKey[],
  noun: string,
) {
  if (!collection) {
    return {
      success: false,
      summary: `無法確認是否有${noun}：臨床資料尚未載入完成`,
      count: 0,
      totalCount: 0,
      returnedCount: 0,
      truncated: false,
      hasMore: false,
      incomplete: true,
      canConcludeAbsence: false,
      queryIssues: [{ resourceType: keys.join(', '), state: 'not-loaded' }],
      data: [],
    }
  }

  const queryIssues = queryIssuesFor(collection, keys)
  if (queryIssues.length === 0) return null
  return {
    success: false,
    summary: `無法確認是否有${noun}：相關 FHIR 資源查詢未成功`,
    count: 0,
    totalCount: 0,
    returnedCount: 0,
    truncated: false,
    hasMore: false,
    incomplete: true,
    canConcludeAbsence: false,
    queryIssues,
    data: [],
  }
}

const attachmentDetailsCache = new WeakMap<object, any[]>()

function attachmentDetails(report: any) {
  if (report && typeof report === 'object') {
    const cached = attachmentDetailsCache.get(report)
    if (cached) return cached
  }
  const details = (report?.presentedForm ?? []).map((attachment: any, index: number) => {
    const contentType = String(attachment?.contentType || '').toLowerCase()
    const isText = contentType.includes('text')
      || contentType.includes('html')
      || contentType.includes('xml')
      || (!contentType && !!attachment?.data)
    const decoded = isText && attachment?.data ? decodeBase64(attachment.data) : ''
    const text = contentType.includes('html') || contentType.includes('xml')
      ? stripHtmlToText(decoded)
      : decoded.trim()
    const maxChars = 12_000
    return {
      title: attachment?.title || `Attachment ${index + 1}`,
      contentType: attachment?.contentType,
      kind: contentType.startsWith('image/')
        ? 'image'
        : isText
          ? 'text'
          : 'binary',
      available: !!(attachment?.data || attachment?._imageRef || attachment?.url),
      ...(text
        ? {
            text: text.slice(0, maxChars),
            textTruncated: text.length > maxChars,
          }
        : {}),
    }
  })
  if (report && typeof report === 'object') {
    attachmentDetailsCache.set(report, details)
  }
  return details
}

function observationResult(observation: any) {
  const interpretation = getInterpretationTag(observation?.interpretation)
  // The source interpretation is authoritative. Only expose a reference range
  // when no interpretation exists, matching the app's audited abnormality
  // policy and preventing the model from presenting contradictory verdicts.
  const referenceRange = interpretation
    ? null
    : getAuditedReferenceRangeBounds(observation?.referenceRange)
  const hasNormalityAssessment = Boolean(interpretation || referenceRange)
  const abnormal = isAbnormalObservation(observation)

  return {
    name: pickName(observation?.code) || 'Unknown',
    value: observation?.valueQuantity?.value
      ?? observation?.valueString
      ?? observation?.valueCodeableConcept?.text,
    unit: observation?.valueQuantity?.unit || '',
    date: observationDate(observation),
    abnormal: hasNormalityAssessment ? abnormal : null,
    normalityStatus: interpretation?.label
      ?? (referenceRange
        ? abnormal ? 'Outside audited reference range' : 'Within audited reference range'
        : 'Not provided'),
    assessmentBasis: interpretation
      ? 'source-interpretation'
      : referenceRange
        ? 'audited-reference-range'
        : 'not-provided',
    ...(referenceRange ? { referenceRange } : {}),
  }
}

function diagnosticReportSearchText(report: any): string {
  return [
    conceptSearchText(report?.code),
    report?.conclusion,
    ...((report?.conclusionCode ?? []).map(conceptSearchText)),
    ...((report?.note ?? []).map((note: any) => note?.text)),
    ...((report?._observations ?? []).map((observation: any) =>
      conceptSearchText(observation?.code)
    )),
    ...attachmentDetails(report).flatMap((attachment: any) => [
      attachment.title,
      attachment.text,
    ]),
  ].filter(Boolean).join(' ')
}

function diagnosticReportQueryTerms(query?: string, queries?: string[]): string[] {
  const terms = [query, ...(queries ?? [])]
    .filter((value): value is string => typeof value === 'string')
    .flatMap(value => value.split(/[,，、;；\n]+/))
    .map(value => value.trim())
    .filter(Boolean)

  return [...new Map(terms.map(term => [term.normalize('NFKC').toLowerCase(), term])).values()]
}

function matchesDiagnosticReportQuery(report: any, queryTerms: string[]): boolean {
  if (queryTerms.length === 0) return true
  const searchText = diagnosticReportSearchText(report)
  return queryTerms.some(term => matchSubstring(searchText, term))
}

function selectDiagnosticReportPage(
  reports: any[],
  queryTerms: string[],
  limit?: number,
): any[] {
  const cap = limit && limit > 0 ? limit : Math.max(10, queryTerms.length)
  if (queryTerms.length === 0) return reports.slice(0, cap)

  // A pure newest-first cap can hide one requested analyte when another has
  // many newer repeats. Reserve one representative row per matched query term
  // before filling the remaining page by recency.
  const selected: any[] = []
  const seen = new Set<any>()
  for (const term of queryTerms) {
    const representative = reports.find(report =>
      matchSubstring(diagnosticReportSearchText(report), term)
    )
    if (representative && !seen.has(representative)) {
      selected.push(representative)
      seen.add(representative)
    }
  }
  for (const report of reports) {
    if (!seen.has(report)) selected.push(report)
  }
  return selected.slice(0, cap)
}

function labAnalyteKey(observation: any): string {
  return getAnalyteCanonicalKey(observation)
    ?? loincOf(observation?.code)
    ?? getAnalyteLabel(observation).normalize('NFKC').toUpperCase()
}

function diagnosticReportOutput(report: any) {
  const date = diagnosticReportDate(report)
  const attachments = attachmentDetails(report)
  return {
    resourceType: 'DiagnosticReport',
    reportName: pickName(report?.code),
    reportCode: report?.code?.coding?.[0]?.code,
    date,
    effectiveDateTime: report?.effectiveDateTime,
    issued: report?.issued,
    status: report?.status,
    conclusion: report?.conclusion,
    conclusionCodes: (report?.conclusionCode ?? []).map(pickName).filter(Boolean),
    notes: (report?.note ?? []).map((note: any) => note?.text).filter(Boolean),
    results: (report?._observations ?? []).map(observationResult),
    attachments,
    imageAttachmentCount: attachments.filter((attachment: any) => attachment.kind === 'image').length,
  }
}

function imagingStudyMetadataForAi(study: any): string {
  const lines: string[] = []
  const push = (label: string, value: unknown) => {
    if (value === undefined || value === null || value === '') return
    lines.push(`${label}: ${value}`)
  }
  const concepts = (values: any[]) =>
    values.map(conceptSearchText).filter(Boolean).join('; ')

  push('Description', study?.description)
  push('Status', study?.status)
  push('Modality', imagingStudyModalityText(study))
  push('Procedure', concepts(study?.procedureCode ?? []))
  push('Reason', concepts(study?.reasonCode ?? []))
  push('Series count', study?.numberOfSeries ?? study?.series?.length)
  push('Instance count', study?.numberOfInstances)
  for (const note of study?.note ?? []) push('Note', note?.text)

  for (const [index, series] of (study?.series ?? []).entries()) {
    const heading = [
      series?.modality?.display || series?.modality?.code,
      series?.description,
    ].filter(Boolean).join(' · ')
    lines.push(`Series ${series?.number ?? index + 1}${heading ? ` — ${heading}` : ''}`)
    push('  Body site', series?.bodySite?.display || series?.bodySite?.code)
    push('  Laterality', series?.laterality?.display || series?.laterality?.code)
    push('  Instance count', series?.numberOfInstances ?? series?.instance?.length)
    const titles = (series?.instance ?? [])
      .map((instance: any) => instance?.title)
      .filter(Boolean)
      .slice(0, 50)
    if (titles.length > 0) push('  Instance titles', titles.join('; '))
  }

  return lines.join('\n')
    || 'ImagingStudy metadata is present; no report narrative was supplied.'
}

function imagingStudySearchText(study: any): string {
  return [
    imagingStudyTitle(study),
    imagingStudyMetadataForAi(study),
    imagingStudyModalityText(study),
  ].filter(Boolean).join(' ')
}

function imagingStudyBodySiteText(study: any): string {
  return (study?.series ?? []).flatMap((series: any) => [
    series?.bodySite?.code,
    series?.bodySite?.display,
    series?.laterality?.code,
    series?.laterality?.display,
  ]).filter(Boolean).join(' ')
}

function imagingStudyModalitySearchText(study: any): string {
  return [
    ...(study?.modality ?? []).flatMap((coding: any) => [
      coding?.code,
      coding?.display,
    ]),
    ...(study?.series ?? []).flatMap((series: any) => [
      series?.modality?.code,
      series?.modality?.display,
    ]),
  ].filter(Boolean).join(' ')
}

function calculateAge(birthDate?: string): number | null {
  if (!birthDate) return null
  const birth = new Date(birthDate)
  if (Number.isNaN(birth.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (
    birthDate.length > 4
    && (m < 0 || (birthDate.length === 10 && m === 0 && today.getDate() < birth.getDate()))
  ) age--
  return age
}

function refToId(ref: string | undefined): string | undefined {
  if (!ref) return undefined
  return ref.includes('/') ? ref.split('/').pop() : ref
}

function encounterDeptText(enc: any): string {
  // Bridge v0.9.2 splits Encounter.type into kind + channel entries (see
  // bridge integration doc 2026-05-27). For AI tool filtering we want a
  // single searchable string that includes BOTH dimensions, so the LLM
  // can match "IC卡資料" or "藥局" or "門診" against the same field.
  // Joining all type[].text/.display covers both v0.9.2 (multi-entry) and
  // v0.9.1 (single-entry) bundles without any version branching.
  if (Array.isArray(enc.type) && enc.type.length > 0) {
    const joined = enc.type
      .map((entry: any) => entry?.text || entry?.coding?.[0]?.display)
      .filter(Boolean)
      .join(' ')
    if (joined) return joined
  }
  return pickName(enc.serviceType) || ''
}

function encounterInstitution(enc: any): string {
  return enc.serviceProvider?.display || enc.location?.[0]?.location?.display || ''
}

function encounterDate(enc: any): string | undefined {
  return enc.period?.start
}

function classifyEncounterType(enc: any):
  'outpatient' | 'inpatient' | 'emergency' | 'pharmacy' | 'home' | 'virtual' | 'other' {
  const cls = String(enc.class?.code || enc.class?.display || '').toLowerCase()
  const dept = encounterDeptText(enc).toLowerCase()
  if (['emer', 'emergency', 'ed'].includes(cls) || dept.includes('急診')) return 'emergency'
  if (['imp', 'inpatient', 'acute'].includes(cls) || dept.includes('住院')) return 'inpatient'
  if (dept.includes('藥局') || cls === 'pharm' || cls === 'pharmacy') return 'pharmacy'
  if (['amb', 'ambulatory', 'outpatient', 'op'].includes(cls) || dept.includes('門診')) return 'outpatient'
  if (['hh', 'home'].includes(cls)) return 'home'
  if (['vr', 'virtual', 'tele'].includes(cls)) return 'virtual'
  return 'other'
}

// Compact deduper for repeated refill cycles (mirrors useMedicationsContext).
function dedupMedsByName(meds: any[]): Array<any & { refillCount: number }> {
  const byName = new Map<string, any & { refillCount: number }>()
  for (const m of meds) {
    const name = pickAiMedicationName(
      m.medicationCodeableConcept,
      m.medicationReference?.display,
    ) || 'Unknown'
    const existing = byName.get(name)
    if (!existing) {
      byName.set(name, { ...m, refillCount: 1 })
    } else {
      existing.refillCount += 1
      if (m.authoredOn && (!existing.authoredOn || m.authoredOn > existing.authoredOn)) {
        existing.authoredOn = m.authoredOn
      }
    }
  }
  return Array.from(byName.values())
}

// ── factory ────────────────────────────────────────────────────────────────

export function createFhirTools(getData: () => AgentDataSource) {
  // Structured scrub (ids / birthDate / provider display) + free-text scrub:
  // discharge summaries and report conclusions carry the patient's name /
  // chart number / 身分證字號 INSIDE the text, so every string is also masked
  // against those patterns and the loaded patient's own name/id literals.
  const scrub = <T,>(payload: T): T =>
    scrubPii(payload, buildPatientTextLiterals(getData().patient))

  return {
    // ── Patient ────────────────────────────────────────────────────────────

    queryPatientInfo: tool({
      description: 'Get anonymized patient demographics (gender + age only). Patient name, ID, and date of birth are intentionally not surfaced.',
      inputSchema: patientInfoSchema,
      execute: async () => {
        const { patient } = getData()
        if (!patient) {
          return scrub({ success: false, summary: 'Patient not loaded yet', data: null })
        }
        return scrub({
          success: true,
          summary: 'Patient demographics retrieved (anonymized)',
          data: {
            gender: patient.gender,
            age: calculateAge(patient.birthDate),
            ...(patient.birthDate && patient.birthDate.length < 10
              ? { ageApproximate: true }
              : {}),
            ...(patient.demographicsSource === 'user-entered-local-profile'
              ? { source: 'user-entered-local-profile' }
              : {}),
          },
        })
      },
    }),

    getDataOverview: tool({
      description: 'Start here when you need an overview of what data is available. Returns counts and date ranges for every resource type. Useful to plan which subsequent tool calls will be informative.',
      inputSchema: overviewSchema,
      execute: async () => {
        const { collection } = getData()
        if (!collection) {
          return scrub({
            success: false,
            summary: 'Clinical data is not loaded yet',
            incomplete: true,
            canConcludeAbsence: false,
            data: null,
          })
        }

        const range = (items: any[], getDate: (x: any) => string | undefined) => {
          const dates = items.map(getDate).filter(Boolean).sort() as string[]
          if (dates.length === 0) return null
          return { earliest: dates[0]?.slice(0, 10), latest: dates[dates.length - 1]?.slice(0, 10) }
        }
        const allQueryIssues = queryIssuesFor(
          collection,
          Object.keys(collection.resourceQueryStatus ?? {}) as ClinicalDataQueryKey[],
        )
        const statusFor = (key: ClinicalDataQueryKey) =>
          collection.resourceQueryStatus?.[key]
            ? { queryStatus: collection.resourceQueryStatus[key]?.state }
            : {}

        return scrub({
          success: true,
          summary: allQueryIssues.length > 0
            ? 'Data inventory loaded, but one or more FHIR resource queries are incomplete'
            : 'Data inventory across all resource types',
          incomplete: allQueryIssues.length > 0,
          canConcludeAbsence: allQueryIssues.length === 0,
          queryIssues: allQueryIssues,
          data: {
            conditions: {
              count: collection.conditions.length,
              ...statusFor('Condition'),
            },
            medications: {
              count: collection.medications.length,
              range: range(collection.medications, (m) => m.authoredOn),
              medicationRequestQueryStatus:
                collection.resourceQueryStatus?.MedicationRequest?.state,
              medicationStatementQueryStatus:
                collection.resourceQueryStatus?.MedicationStatement?.state,
            },
            allergies: {
              count: collection.allergies.length,
              ...statusFor('AllergyIntolerance'),
            },
            encounters: {
              count: collection.encounters.length,
              range: range(collection.encounters, (e) => e.period?.start),
              ...statusFor('Encounter'),
            },
            diagnosticReports: {
              count: collection.diagnosticReports.length,
              range: range(collection.diagnosticReports, diagnosticReportDate),
              ...statusFor('DiagnosticReport'),
            },
            imagingStudies: {
              count: collection.imagingStudies?.length ?? 0,
              range: range(collection.imagingStudies ?? [], (study) => study.started),
              ...statusFor('ImagingStudy'),
            },
            observations: {
              // Dedup by id — many bridges include vital-signs entries in
              // both `observations` and `vitalSigns` arrays.
              count: new Set([
                ...collection.observations.map((o: any) => o.id).filter(Boolean),
                ...collection.vitalSigns.map((o: any) => o.id).filter(Boolean),
              ]).size,
              range: range(
                [...collection.observations, ...collection.vitalSigns],
                observationDate,
              ),
              ...statusFor('Observation'),
              vitalSignsQueryStatus:
                collection.resourceQueryStatus?.['Observation:vital-signs']?.state,
            },
            procedures: {
              count: collection.procedures.length,
              range: range(collection.procedures, (p) => p.performedDateTime || p.performedPeriod?.start),
              ...statusFor('Procedure'),
            },
            immunizations: {
              count: collection.immunizations.length,
              range: range(collection.immunizations, (i) => i.occurrenceDateTime),
              ...statusFor('Immunization'),
            },
          },
        })
      },
    }),

    // ── Visits ─────────────────────────────────────────────────────────────

    getHealthSummarySnapshot: tool({
      description: 'PRIMARY compact tool for a broad patient health summary. In one call returns deduplicated conditions, current medications, latest abnormal labs, and recent vital signs. Prefer this over several separate tools when the user asks for an overall summary of their imported record.',
      inputSchema: healthSummarySnapshotSchema,
      execute: async () => {
        const collection = getData().collection
        const unavailable = unavailableQueryResult(
          collection,
          ['Condition', 'MedicationRequest', 'MedicationStatement', 'Observation'],
          '健康摘要資料',
        )
        if (unavailable) return scrub(unavailable)

        const queryIssues = queryIssuesFor(collection!, [
          'Condition',
          'MedicationRequest',
          'MedicationStatement',
          'Observation',
        ])
        const conditionByName = new Map<string, any>()
        for (const condition of collection!.conditions) {
          const name = pickName(condition.code) || 'Unknown'
          const key = name.normalize('NFKC').trim().toLowerCase()
          const existing = conditionByName.get(key)
          if (!existing || (condition.recordedDate || '') > (existing.recordedDate || '')) {
            conditionByName.set(key, condition)
          }
        }
        const allConditions = [...conditionByName.values()]
          .sort((left, right) => (right.recordedDate || '').localeCompare(left.recordedDate || ''))
        const conditions = allConditions.slice(0, 40).map((condition) => ({
          name: pickName(condition.code) || 'Unknown',
          status: typeof condition.clinicalStatus === 'string'
            ? condition.clinicalStatus
            : condition.clinicalStatus?.coding?.[0]?.code,
          date: condition.recordedDate,
        }))

        const authoredTimes = collection!.medications
          .map((medication: any) => Date.parse(medication.authoredOn || ''))
          .filter(Number.isFinite)
        const latestMedicationTime = authoredTimes.length > 0
          ? Math.max(...authoredTimes)
          : Date.now()
        const recentMedicationCutoff = latestMedicationTime - 180 * 86_400_000
        const activeMedicationRecords = collection!.medications.filter((medication: any) => {
          const status = String(medication.status || '').toLowerCase()
          if (['stopped', 'cancelled'].includes(status)) return false
          if (status === 'active') return true
          const authoredTime = Date.parse(medication.authoredOn || '')
          return Number.isFinite(authoredTime) && authoredTime >= recentMedicationCutoff
        })
        const allMedications = dedupMedsByName(activeMedicationRecords)
          .sort((left, right) => (right.authoredOn || '').localeCompare(left.authoredOn || ''))
        const medications = allMedications.slice(0, 40).map((medication: any) => ({
          name: pickAiMedicationName(
            medication.medicationCodeableConcept,
            medication.medicationReference?.display,
          ),
          dosage: medication.dosageInstruction?.[0]?.text,
          date: medication.authoredOn,
          chronic: isChronicByCourseOfTherapy(medication.courseOfTherapyType),
        }))

        const abnormalByAnalyte = new Map<string, any>()
        for (const observation of collection!.observations.flatMap(item =>
          expandObservationValues(item)
        )) {
          if (String(observation?.status ?? '').toLowerCase() === 'entered-in-error') continue
          if (!categorizeObservation(observation) || !isAbnormalObservation(observation)) continue
          const key = labAnalyteKey(observation)
          const existing = abnormalByAnalyte.get(key)
          if (!existing || (observationDate(observation) || '') > (observationDate(existing) || '')) {
            abnormalByAnalyte.set(key, observation)
          }
        }
        const allAbnormalLabs = [...abnormalByAnalyte.values()]
          .sort((left, right) => (observationDate(right) || '').localeCompare(observationDate(left) || ''))
        const abnormalLabs = allAbnormalLabs.slice(0, 60).map(observationResult)

        const vitalByAnalyte = new Map<string, any>()
        for (const vital of collection!.vitalSigns) {
          const key = labAnalyteKey(vital)
          const existing = vitalByAnalyte.get(key)
          if (!existing || (observationDate(vital) || '') > (observationDate(existing) || '')) {
            vitalByAnalyte.set(key, vital)
          }
        }
        const allVitals = [...vitalByAnalyte.values()]
          .sort((left, right) => (observationDate(right) || '').localeCompare(observationDate(left) || ''))
        const recentVitals = allVitals.slice(0, 10).map(observationResult)

        return scrub({
          success: true,
          summary: 'Compact cross-domain health summary snapshot',
          incomplete: queryIssues.length > 0,
          canConcludeAbsence: queryIssues.length === 0,
          queryIssues,
          counts: {
            conditions: allConditions.length,
            activeMedications: allMedications.length,
            abnormalLabs: allAbnormalLabs.length,
            recentVitals: allVitals.length,
          },
          truncated: {
            conditions: allConditions.length > conditions.length,
            activeMedications: allMedications.length > medications.length,
            abnormalLabs: allAbnormalLabs.length > abnormalLabs.length,
            recentVitals: allVitals.length > recentVitals.length,
          },
          groundingRules: {
            medicationFieldsOnly: true,
            normalityStatusIsAuthoritative: true,
            instruction: 'Use only these records. The snapshot is already loaded: never ask the user to import or re-import data. Do not infer medication ingredients/purposes or add customary lab ranges. If a section is empty and canConcludeAbsence is false, say the data may be incomplete. Answer in Taiwan Traditional Chinese with sections for recent condition/chronic disease, current medications, and abnormal tests. End by reminding the user to discuss concerns with their physician.',
          },
          data: {
            conditions,
            medications,
            abnormalLabs,
            recentVitals,
          },
        })
      },
    }),

    queryEncounters: tool({
      description: 'Query patient encounters (visits, admissions). Supports filtering by class, department text, institution, and date range.',
      inputSchema: encountersSchema,
      execute: async ({ class: encounterClass, department, institution, dateFrom, dateTo, limit, summarize }:
        z.infer<typeof encountersSchema>) => {
        const list = getData().collection?.encounters ?? []
        let filtered = list.filter((e: any) =>
          matchEncounterClass(e.class, encounterClass) &&
          matchSubstring(encounterDeptText(e), department) &&
          matchSubstring(encounterInstitution(e), institution)
        )
        if (dateFrom || dateTo) {
          filtered = filtered.filter((e: any) => isWithinDateRange(encounterDate(e), dateFrom, dateTo))
        }
        filtered = [...filtered].sort((a, b) =>
          (b.period?.start || '').localeCompare(a.period?.start || '')
        )
        const capped = applyLimit(filtered, limit)

        if (summarize) {
          return scrub({
            success: true,
            summary: `Found ${filtered.length} Encounter record(s)`,
            count: filtered.length,
            data: capped.map((e: any) => ({
              encounterId: e.id,
              date: encounterDate(e)?.slice(0, 10),
              type: classifyEncounterType(e),
            })),
          })
        }

        return scrub({
          success: true,
          summary: `Found ${filtered.length} Encounter record(s)`,
          count: filtered.length,
          data: capped.map((e: any) => ({
            encounterId: e.id,
            class: e.class?.code || e.class?.coding?.[0]?.code,
            type: pickName(e.type?.[0]),
            department: encounterDeptText(e),
            institution: encounterInstitution(e),
            period: e.period,
            status: e.status,
          })),
        })
      },
    }),

    getRecentVisits: tool({
      description: 'Concise summary of the most recent N visits: date, department, primary ICD, and counts of meds/labs/procedures. Use this before drilling into a specific visit with getEncounterDetails.',
      inputSchema: recentVisitsSchema,
      execute: async ({ limit, type }: z.infer<typeof recentVisitsSchema>) => {
        const { collection } = getData()
        if (!collection) return scrub({ success: false, summary: 'No data', data: [] })

        const encounters = [...collection.encounters].sort((a, b) =>
          (b.period?.start || '').localeCompare(a.period?.start || '')
        )
        const filtered = encounters.filter((e: any) =>
          !type || classifyEncounterType(e) === type
        )
        const top = filtered.slice(0, limit && limit > 0 ? limit : 10)

        const medsByEnc = new Map<string, number>()
        for (const m of collection.medications) {
          const id = refToId(m.encounter?.reference)
          if (id) medsByEnc.set(id, (medsByEnc.get(id) ?? 0) + 1)
        }
        const labsByEnc = new Map<string, number>()
        for (const o of collection.observations) {
          const id = refToId(o.encounter?.reference)
          if (id) labsByEnc.set(id, (labsByEnc.get(id) ?? 0) + 1)
        }
        const procsByEnc = new Map<string, number>()
        for (const p of collection.procedures) {
          const id = refToId(p.encounter?.reference)
          if (id) procsByEnc.set(id, (procsByEnc.get(id) ?? 0) + 1)
        }

        return scrub({
          success: true,
          summary: `Top ${top.length} of ${filtered.length} recent visits`,
          count: top.length,
          data: top.map((e: any) => ({
            encounterId: e.id,
            date: encounterDate(e)?.slice(0, 10),
            type: classifyEncounterType(e),
            department: encounterDeptText(e),
            primaryIcd: e.reasonCode?.[0]?.coding?.[0]?.code,
            primaryIcdLabel: pickName(e.reasonCode?.[0]) || e.reasonCode?.[0]?.text,
            medCount: medsByEnc.get(e.id) ?? 0,
            labCount: labsByEnc.get(e.id) ?? 0,
            procedureCount: procsByEnc.get(e.id) ?? 0,
          })),
        })
      },
    }),

    getEncounterDetails: tool({
      description: 'Drill into one specific visit. Returns all diagnoses (incl. secondary), medications, lab observations, procedures linked to that encounter. Use this when the user asks about a specific visit identified via queryEncounters or getRecentVisits.',
      inputSchema: encounterDetailsSchema,
      execute: async ({ encounterId }: z.infer<typeof encounterDetailsSchema>) => {
        const { collection } = getData()
        if (!collection) return scrub({ success: false, summary: 'No data', data: null })

        const enc = collection.encounters.find((e: any) => e.id === encounterId)
        if (!enc) {
          return scrub({
            success: false,
            summary: `Encounter ${encounterId} not found`,
            data: null,
          })
        }

        const matches = (ref: any) => refToId(ref?.reference) === encounterId

        const diagnoses = (enc.reasonCode ?? []).map((rc: any) => ({
          code: rc.coding?.[0]?.code,
          label: pickName(rc) || rc.text,
        }))

        const meds = collection.medications.filter((m: any) => matches(m.encounter)).map((m: any) => ({
          medication: pickAiMedicationName(
            m.medicationCodeableConcept,
            m.medicationReference?.display,
          ),
          dosage: m.dosageInstruction?.[0]?.text,
          status: m.status,
          chronic: isChronicByCourseOfTherapy(m.courseOfTherapyType),
        }))

        const obs = collection.observations.filter((o: any) => matches(o.encounter)).map((o: any) => ({
          name: pickName(o.code),
          value: o.valueQuantity?.value ?? o.valueString,
          unit: o.valueQuantity?.unit,
          abnormal: isAbnormalObservation(o),
        }))

        const procs = collection.procedures.filter((p: any) => matches(p.encounter)).map((p: any) => ({
          procedure: pickName(p.code),
          status: p.status,
          performedDateTime: p.performedDateTime || p.performedPeriod?.start,
        }))

        const reports = collection.diagnosticReports.filter((r: any) => matches(r.encounter)).map((r: any) => ({
          reportName: pickName(r.code),
          conclusion: r.conclusion,
          effectiveDateTime: r.effectiveDateTime,
        }))

        const imagingStudies = (collection.imagingStudies ?? []).filter((study: any) => matches(study.encounter)).map((study: any) => ({
          description: study.description,
          status: study.status,
          started: study.started,
          modality: (study.modality ?? []).map((coding: any) => coding.display || coding.code).filter(Boolean),
          notes: (study.note ?? []).map((note: any) => note.text).filter(Boolean),
          series: (study.series ?? []).map((series: any) => ({
            description: series.description,
            modality: series.modality?.display || series.modality?.code,
            bodySite: series.bodySite?.display || series.bodySite?.code,
            laterality: series.laterality?.display || series.laterality?.code,
            numberOfInstances: series.numberOfInstances,
            instanceTitles: (series.instance ?? []).map((instance: any) => instance.title).filter(Boolean),
          })),
        }))

        return scrub({
          success: true,
          summary: `Encounter ${encounterId} details`,
          data: {
            encounterId,
            date: encounterDate(enc)?.slice(0, 10),
            type: classifyEncounterType(enc),
            department: encounterDeptText(enc),
            institution: encounterInstitution(enc),
            diagnoses,
            medications: meds,
            observations: obs,
            procedures: procs,
            reports,
            imagingStudies,
          },
        })
      },
    }),

    listEncounterDepartments: tool({
      description: 'List unique departments / service types the patient has visited. Useful to discover what specialties are represented before filtering queryEncounters by department.',
      inputSchema: listDepartmentsSchema,
      execute: async () => {
        const { collection } = getData()
        const list = collection?.encounters ?? []
        const counts = new Map<string, number>()
        for (const e of list) {
          const dept = encounterDeptText(e)
          if (dept) counts.set(dept, (counts.get(dept) ?? 0) + 1)
        }
        const data = Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([department, visitCount]) => ({ department, visitCount }))

        return scrub({
          success: true,
          summary: `${data.length} distinct departments`,
          count: data.length,
          data,
        })
      },
    }),

    // ── Diagnoses & Problems ───────────────────────────────────────────────

    queryConditions: tool({
      description: 'Query patient conditions/diagnoses (cross-visit). Use this for confirmed clinical conditions, not visit-level billing ICDs.',
      inputSchema: conditionsSchema,
      execute: async ({ category, clinicalStatus, limit }: z.infer<typeof conditionsSchema>) => {
        const list = getData().collection?.conditions ?? []
        const filtered = list.filter((c: any) =>
          matchCategoryCoding(c.category, category) &&
          matchClinicalStatus(c.clinicalStatus, clinicalStatus)
        )
        const capped = applyLimit(filtered, limit, 100)
        return scrub({
          success: true,
          summary: `Found ${filtered.length} Condition record(s)`,
          count: filtered.length,
          data: capped.map((c: any) => ({
            code: pickName(c.code),
            clinicalStatus: typeof c.clinicalStatus === 'string'
              ? c.clinicalStatus
              : c.clinicalStatus?.coding?.[0]?.code,
            recordedDate: c.recordedDate,
          })),
        })
      },
    }),

    // ── Reports ────────────────────────────────────────────────────────────

    queryObservations: tool({
      description: 'Query patient observations (lab results, vital signs). Supports date range, exact code, fuzzy `codeQuery`, and `abnormalOnly`. For lab panels prefer queryDiagnosticReports; for trend of a specific lab prefer searchObservationByName.',
      inputSchema: observationsSchema,
      execute: async ({ category, code, codeQuery, abnormalOnly, dateFrom, dateTo, limit, summarize }:
        z.infer<typeof observationsSchema>) => {
        const collection = getData().collection
        const unavailable = unavailableQueryResult(
          collection,
          ['Observation'],
          '檢驗或觀察數據',
        )
        if (unavailable) return scrub(unavailable)

        const observations = collection!.observations
        const vitals = collection!.vitalSigns
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
            // Case-insensitive — LLMs commonly mis-case ("body height" vs "Body Height")
            const targetLc = code.toLowerCase()
            const codes: string[] = (o.code?.coding ?? [])
              .map((c: any) => String(c?.code || '').toLowerCase())
              .filter(Boolean)
            const nameLc = pickName(o.code)?.toLowerCase() ?? ''
            if (!codes.includes(targetLc) && nameLc !== targetLc) return false
          }
          if (codeQuery && !matchSubstring(conceptSearchText(o.code), codeQuery)) return false
          if (abnormalOnly && !isAbnormalObservation(o)) return false
          return true
        })

        if (dateFrom || dateTo) {
          filtered = filtered.filter((o: any) =>
            isWithinDateRange(observationDate(o), dateFrom, dateTo)
          )
        }

        filtered = [...filtered].sort((a, b) =>
          (observationDate(b) || '').localeCompare(observationDate(a) || '')
        )
        const capped = applyLimit(filtered, limit)
        const page = paginationMeta(filtered.length, capped.length)

        const summary = filtered.length > 0
          ? `Found ${filtered.length} Observation record(s)`
          : notFoundMessage('檢驗數據', dateFrom, dateTo)

        if (summarize) {
          return scrub({
            success: true,
            summary,
            count: filtered.length,
            ...page,
            incomplete: false,
            canConcludeAbsence: true,
            dateRange: { from: dateFrom, to: dateTo },
            data: capped.map((o: any) => ({
              code: pickName(o.code),
              date: observationDate(o),
              effectiveDateTime: o.effectiveDateTime,
              abnormal: isAbnormalObservation(o),
            })),
          })
        }

        return scrub({
          success: true,
          summary,
          count: filtered.length,
          ...page,
          incomplete: false,
          canConcludeAbsence: true,
          dateRange: { from: dateFrom, to: dateTo },
          data: capped.map((o: any) => ({
            code: pickName(o.code),
            value: o.valueQuantity?.value ?? o.valueString,
            unit: o.valueQuantity?.unit,
            date: observationDate(o),
            effectiveDateTime: o.effectiveDateTime,
            abnormal: isAbnormalObservation(o),
            status: o.status,
          })),
        })
      },
    }),

    queryDiagnosticReports: tool({
      description: 'Query DiagnosticReport records for lab panels and report-level tests. Search is case- and separator-insensitive, so CA199, CA-199, CA–199, and CA 19-9 match. For multiple specific tests use `queries` (for example ["CA125", "CA199"]), or comma-separate them in `query`; matching records plus matchedQueryTerms/unmatchedQueryTerms are returned. Also supports category, date range, and abnormalOnly. For imaging/pathology questions prefer queryImagingRecords, which also covers standalone ImagingStudy resources.',
      inputSchema: diagnosticReportsSchema,
      execute: async ({ category, query, queries, abnormalOnly, dateFrom, dateTo, limit, summarize }:
        z.infer<typeof diagnosticReportsSchema>) => {
        const collection = getData().collection
        const unavailable = unavailableQueryResult(
          collection,
          ['DiagnosticReport'],
          '檢驗或診斷報告',
        )
        if (unavailable) return scrub(unavailable)
        // Report names/conclusions remain usable if the separate Observation
        // search failed, but component-result coverage may then be incomplete.
        const queryIssues = queryIssuesFor(collection!, ['Observation'])
        const incomplete = queryIssues.length > 0
        const requestedQueryTerms = diagnosticReportQueryTerms(query, queries)

        const list = collection!.diagnosticReports
        let filtered = list.filter((r: any) =>
          matchDiagnosticReportCategory(r, category)
          && matchesDiagnosticReportQuery(r, requestedQueryTerms)
        )
        if (dateFrom || dateTo) {
          filtered = filtered.filter((r: any) =>
            isWithinDateRange(diagnosticReportDate(r), dateFrom, dateTo)
          )
        }
        if (abnormalOnly) {
          filtered = filtered.filter((r: any) =>
            Array.isArray(r._observations) && r._observations.some(isAbnormalObservation)
          )
        }
        filtered = [...filtered].sort((a, b) =>
          (diagnosticReportDate(b) || '').localeCompare(diagnosticReportDate(a) || '')
        )
        const matchedQueryTerms = requestedQueryTerms.filter(term =>
          filtered.some(report => matchSubstring(diagnosticReportSearchText(report), term))
        )
        const unmatchedQueryTerms = requestedQueryTerms.filter(term =>
          !matchedQueryTerms.includes(term)
        )
        const capped = selectDiagnosticReportPage(filtered, requestedQueryTerms, limit)
        const page = paginationMeta(filtered.length, capped.length)

        const summary = filtered.length > 0
          ? `Found ${filtered.length} DiagnosticReport record(s)`
          : incomplete
            ? 'Unable to determine absence because Observation result coverage is incomplete'
          : notFoundMessage('檢驗報告', dateFrom, dateTo)

        if (summarize) {
          return scrub({
            success: filtered.length > 0 || !incomplete,
            summary,
            count: filtered.length,
            ...page,
            incomplete,
            canConcludeAbsence: !incomplete,
            queryIssues,
            requestedQueryTerms,
            matchedQueryTerms,
            unmatchedQueryTerms,
            dateRange: { from: dateFrom, to: dateTo },
            data: capped.map((r: any) => ({
              reportName: pickName(r.code),
              reportCode: r.code?.coding?.[0]?.code,
              date: diagnosticReportDate(r),
              effectiveDateTime: r.effectiveDateTime,
              issued: r.issued,
              abnormalCount: (r._observations ?? []).filter(isAbnormalObservation).length,
              resultCount: (r._observations ?? []).length,
              imageAttachmentCount: attachmentDetails(r)
                .filter((attachment: any) => attachment.kind === 'image').length,
            })),
          })
        }

        return scrub({
          success: filtered.length > 0 || !incomplete,
          summary,
          count: filtered.length,
          ...page,
          incomplete,
          canConcludeAbsence: !incomplete,
          queryIssues,
          requestedQueryTerms,
          matchedQueryTerms,
          unmatchedQueryTerms,
          dateRange: { from: dateFrom, to: dateTo },
          data: capped.map(diagnosticReportOutput),
        })
      },
    }),

    queryLabResultsByCategory: tool({
      description: 'PRIMARY tool for semantic lab-group questions such as "all tumor markers", "cancer markers", "CBC", "renal/liver biochemistry", "lipids", "diabetes labs", or "urinalysis". Uses the exact same audited lab classification as the cumulative-report UI. `category="tumor"` returns every tumor-marker analyte the patient actually has (for example AFP, CEA, CA-125, CA-199/CA19-9, PSA), not merely the names mentioned by the user. By default returns the latest value for every analyte; set withTrend=true for up to 10 values per analyte.',
      inputSchema: labResultsByCategorySchema,
      execute: async ({ category, withTrend, abnormalOnly, dateFrom, dateTo, limit }:
        z.infer<typeof labResultsByCategorySchema>) => {
        const collection = getData().collection
        const unavailable = unavailableQueryResult(
          collection,
          ['Observation'],
          '指定分類的檢驗數據',
        )
        if (unavailable) return scrub(unavailable)

        const categoryDefinition = LAB_CATEGORIES.find(item => item.id === category)!
        const expanded = collection!.observations
          .flatMap(observation => expandObservationValues(observation))
          .filter((observation: any) =>
            String(observation?.status ?? '').toLowerCase() !== 'entered-in-error'
            && categorizeObservation(observation)?.id === category
            && isWithinDateRange(observationDate(observation), dateFrom, dateTo)
            && (!abnormalOnly || isAbnormalObservation(observation))
          )

        const byAnalyte = new Map<string, any[]>()
        for (const observation of expanded) {
          const key = labAnalyteKey(observation)
          const series = byAnalyte.get(key)
          if (series) series.push(observation)
          else byAnalyte.set(key, [observation])
        }

        const groups = [...byAnalyte.entries()].map(([canonicalKey, observations]) => {
          const series = [...observations].sort((a, b) =>
            (observationDate(b) || '').localeCompare(observationDate(a) || '')
          )
          return {
            analyte: getAnalyteLabel(series[0]),
            canonicalKey,
            category,
            observationCount: series.length,
            latestDate: observationDate(series[0]),
            results: series.slice(0, withTrend ? 10 : 1).map(observationResult),
          }
        }).sort((a, b) =>
          compareTestsByPreferred(categoryDefinition)(a.analyte, b.analyte)
        )

        const capped = applyLimit(groups, limit, 50)
        const page = paginationMeta(groups.length, capped.length)
        return scrub({
          success: true,
          summary: groups.length > 0
            ? `Found ${groups.length} analyte(s) in lab category "${category}"`
            : `No observations matched lab category "${category}"`,
          category,
          count: groups.length,
          analyteCount: groups.length,
          observationCount: expanded.length,
          ...page,
          incomplete: false,
          canConcludeAbsence: true,
          dateRange: { from: dateFrom, to: dateTo },
          availableAnalytes: groups.map(group => group.analyte),
          groundingRules: {
            normalityStatusIsAuthoritative: true,
            referenceRangeMayOnlyBeRepeatedWhenPresent: true,
            missingNormalityText: '資料未提供正常／異常判定',
            instruction: 'Do not add customary ranges, diagnose a condition, or infer the cause of an abnormal result.',
          },
          data: capped,
        })
      },
    }),

    queryImagingRecords: tool({
      description: 'PRIMARY tool for imaging and pathology existence/details. Queries BOTH imaging/pathology DiagnosticReports and standalone ImagingStudy resources using the same classification rules as the Imaging UI. Supports fuzzy query, modality, body site, status, and date range. Image attachments are reported as present without sending binary pixels; textual report attachments are decoded.',
      inputSchema: imagingRecordsSchema,
      execute: async ({ query, modality, bodySite, status, dateFrom, dateTo, limit, summarize }:
        z.infer<typeof imagingRecordsSchema>) => {
        const collection = getData().collection
        if (!collection) {
          return scrub(unavailableQueryResult(
            collection,
            ['DiagnosticReport', 'ImagingStudy'],
            '影像或病理檢查',
          ))
        }

        const queryIssues = queryIssuesFor(
          collection,
          ['DiagnosticReport', 'ImagingStudy'],
        )
        const studiesById = new Map(
          (collection.imagingStudies ?? [])
            .filter((study: any) => !!study?.id)
            .map((study: any) => [study.id, study]),
        )
        const linkedStudyIds = new Set<string>()
        const records: any[] = []

        for (const report of collection.diagnosticReports) {
          if (!matchDiagnosticReportCategory(report, 'imaging')) continue
          const linkedStudies = (report.imagingStudy ?? [])
            .map((reference: any) => referenceId(reference?.reference))
            .filter((id: string | undefined): id is string => !!id)
            .map((id: string) => {
              linkedStudyIds.add(id)
              return studiesById.get(id)
            })
            .filter(Boolean)

          const reportSearchText = [
            diagnosticReportSearchText(report),
            ...linkedStudies.map(imagingStudySearchText),
          ].join(' ')
          const modalityText = [
            conceptSearchText(report.code),
            ...linkedStudies.map(imagingStudyModalitySearchText),
          ].filter(Boolean).join(' ')
          const bodySiteText = [
            conceptSearchText(report.code),
            report.conclusion,
            ...linkedStudies.map(imagingStudyBodySiteText),
          ].filter(Boolean).join(' ')
          const date = diagnosticReportDate(report)

          if (!matchSubstring(reportSearchText, query)) continue
          if (!matchSubstring(modalityText, modality)) continue
          if (!matchSubstring(bodySiteText, bodySite)) continue
          if (
            !matchStatus(report.status, status)
            && !linkedStudies.some((study: any) => matchStatus(study.status, status))
          ) continue
          if ((dateFrom || dateTo) && !isWithinDateRange(date, dateFrom, dateTo)) continue

          const detail = diagnosticReportOutput(report)
          records.push({
            ...detail,
            linkedImagingStudies: linkedStudies.map((study: any) => ({
              resourceType: 'ImagingStudy',
              studyName: imagingStudyTitle(study),
              date: study.started,
              status: study.status,
              modality: imagingStudyModalityText(study),
              metadata: imagingStudyMetadataForAi(study),
            })),
          })
        }

        for (const study of collection.imagingStudies ?? []) {
          if (study?.id && linkedStudyIds.has(study.id)) continue
          const searchText = imagingStudySearchText(study)
          const modalitySearchText = imagingStudyModalitySearchText(study)
          const modalityText = imagingStudyModalityText(study)
          const bodySiteText = imagingStudyBodySiteText(study)
          if (!matchSubstring(searchText, query)) continue
          if (!matchSubstring(modalitySearchText, modality)) continue
          if (!matchSubstring(bodySiteText, bodySite)) continue
          if (!matchStatus(study.status, status)) continue
          if (
            (dateFrom || dateTo)
            && !isWithinDateRange(study.started, dateFrom, dateTo)
          ) continue

          records.push({
            resourceType: 'ImagingStudy',
            studyName: imagingStudyTitle(study),
            date: study.started,
            status: study.status,
            modality: modalityText,
            bodySite: bodySiteText || undefined,
            metadata: imagingStudyMetadataForAi(study),
          })
        }

        records.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        const capped = applyLimit(records, limit, 20)
        const page = paginationMeta(records.length, capped.length)
        const incomplete = queryIssues.length > 0
        const summary = records.length > 0
          ? `Found ${records.length} imaging/pathology record(s)`
          : incomplete
            ? 'Unable to determine absence because one or more imaging resource queries failed'
            : notFoundMessage('影像或病理檢查', dateFrom, dateTo)

        return scrub({
          success: records.length > 0 || !incomplete,
          summary,
          count: records.length,
          ...page,
          incomplete,
          canConcludeAbsence: !incomplete,
          queryIssues,
          dateRange: { from: dateFrom, to: dateTo },
          data: summarize
            ? capped.map((record: any) => ({
                resourceType: record.resourceType,
                name: record.reportName || record.studyName,
                date: record.date,
                status: record.status,
                modality: record.modality,
                resultCount: record.results?.length,
                imageAttachmentCount: record.imageAttachmentCount,
              }))
            : capped,
        })
      },
    }),

    searchObservationByName: tool({
      description: 'Fuzzy-search observations by name when you don\'t know the LOINC. e.g. query="HbA1c" returns latest values. Set withTrend=true to get up to 10 most recent values for trending.',
      inputSchema: observationSearchSchema,
      execute: async ({ query, withTrend, limit }: z.infer<typeof observationSearchSchema>) => {
        const { collection } = getData()
        const unavailable = unavailableQueryResult(
          collection,
          ['Observation'],
          '指定名稱的檢驗或觀察數據',
        )
        if (unavailable) return scrub(unavailable)

        const all = [...collection!.observations, ...collection!.vitalSigns]
        const seen = new Set<string>()
        const unique = all.filter((o: any) => {
          if (o.id && seen.has(o.id)) return false
          if (o.id) seen.add(o.id)
          return true
        })

        // Grouping key = LOINC code so one analyte stored under different display
        // names (e.g. "eGFR" vs "Estimated GFR", both LOINC 33914-3) collapses
        // into a single dated series instead of splitting — which would let a
        // stale value be returned as "latest". Real data also mixes coded and
        // uncoded entries of the same analyte (e.g. PT: one with LOINC, one
        // without), so an uncoded entry inherits the LOINC of a same-text sibling.
        const textToLoinc = new Map<string, string>()
        for (const o of unique) {
          const loinc = loincOf(o.code)
          const text = o.code?.text
          if (loinc && text && !textToLoinc.has(text)) textToLoinc.set(text, loinc)
        }
        const codeKey = (concept: any): string =>
          loincOf(concept) ||
          (concept?.text && textToLoinc.get(concept.text)) ||
          concept?.coding?.[0]?.code ||
          pickName(concept) ||
          'Unknown'

        // Seed match: the query may hit any display name OR coding display, not
        // just the canonical text.
        const nameMatches = (o: any): boolean => {
          const c = o.code || {}
          const names = [c.text, ...((c.coding || []).map((x: any) => x.display))]
          return names.some((n: string | undefined) => matchSubstring(n, query))
        }
        const seedKeys = new Set(unique.filter(nameMatches).map((o: any) => codeKey(o.code)))
        // Expand to every observation sharing a matched LOINC, so display aliases
        // (e.g. "eGFR" vs "Estimated GFR") come along as one series.
        let matches = unique.filter((o: any) => seedKeys.has(codeKey(o.code)))
        matches = matches.sort((a, b) =>
          (observationDate(b) || '').localeCompare(observationDate(a) || '')
        )

        // Group by LOINC code → keep N most recent per analyte
        const perCodeLimit = withTrend ? 10 : 1
        const byCode = new Map<string, any[]>()
        for (const o of matches) {
          const k = codeKey(o.code)
          const arr = byCode.get(k) ?? []
          if (arr.length < perCodeLimit) {
            arr.push(o)
            byCode.set(k, arr)
          }
        }

        const flat: any[] = []
        for (const [, items] of byCode) {
          // Canonical display = the most-recent entry's name (matches found at top).
          const name = pickName(items[0].code) || 'Unknown'
          for (const o of items) flat.push({ name, obs: o })
        }
        const capped = applyLimit(flat, limit, 50)
        const page = paginationMeta(flat.length, capped.length)

        return scrub({
          success: true,
          summary: `Matched ${matches.length} observation(s) across ${byCode.size} code(s) for "${query}"`,
          count: capped.length,
          ...page,
          incomplete: false,
          canConcludeAbsence: true,
          data: capped.map(({ name, obs }) => ({
            code: name,
            value: obs.valueQuantity?.value ?? obs.valueString,
            unit: obs.valueQuantity?.unit,
            date: observationDate(obs),
            effectiveDateTime: obs.effectiveDateTime,
            abnormal: isAbnormalObservation(obs),
          })),
        })
      },
    }),

    queryProcedures: tool({
      description: 'Query patient procedures (surgeries, interventions).',
      inputSchema: proceduresSchema,
      execute: async ({ status, dateFrom, dateTo, limit }: z.infer<typeof proceduresSchema>) => {
        const list = getData().collection?.procedures ?? []
        let filtered = list.filter((p: any) => matchStatus(p.status, status))
        if (dateFrom || dateTo) {
          filtered = filtered.filter((p: any) =>
            isWithinDateRange(p.performedDateTime || p.performedPeriod?.start, dateFrom, dateTo)
          )
        }
        const capped = applyLimit(filtered, limit)
        return scrub({
          success: true,
          summary: `Found ${filtered.length} Procedure record(s)`,
          count: filtered.length,
          data: capped.map((p: any) => ({
            procedure: pickName(p.code),
            status: p.status,
            performedDateTime: p.performedDateTime || p.performedPeriod?.start,
          })),
        })
      },
    }),

    listAvailableObservationCodes: tool({
      description: 'List distinct observation / lab names the patient has on record, with how many entries exist for each. Useful before using searchObservationByName when you\'re unsure what to search for.',
      inputSchema: listObservationCodesSchema,
      execute: async () => {
        const { collection } = getData()
        const unavailable = unavailableQueryResult(
          collection,
          ['Observation'],
          '可查詢的檢驗項目',
        )
        if (unavailable) return scrub(unavailable)

        const all = [...collection!.observations, ...collection!.vitalSigns]
        const counts = new Map<string, number>()
        for (const o of all) {
          const name = pickName(o.code)
          if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
        }
        const data = Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([code, count]) => ({ code, count }))

        return scrub({
          success: true,
          summary: `${data.length} distinct observation codes`,
          count: data.length,
          ...paginationMeta(data.length, data.length),
          incomplete: false,
          canConcludeAbsence: true,
          data,
        })
      },
    }),

    // ── Medications & Allergies ────────────────────────────────────────────

    queryMedications: tool({
      description: 'Query medication prescriptions. Supports status / chronic / date range. For "what is the patient on right now" prefer getActiveMedicationList — it dedups refill cycles automatically.',
      inputSchema: medicationsSchema,
      execute: async ({ status, chronic, dateFrom, dateTo, limit }:
        z.infer<typeof medicationsSchema>) => {
        const list = getData().collection?.medications ?? []
        let filtered = list.filter((m: any) =>
          matchStatus(m.status, status) &&
          matchChronic(m.courseOfTherapyType, chronic)
        )
        if (dateFrom || dateTo) {
          filtered = filtered.filter((m: any) => isWithinDateRange(m.authoredOn, dateFrom, dateTo))
        }
        filtered = [...filtered].sort((a, b) => (b.authoredOn || '').localeCompare(a.authoredOn || ''))
        const capped = applyLimit(filtered, limit)
        return scrub({
          success: true,
          summary: `Found ${filtered.length} MedicationRequest record(s)`,
          count: filtered.length,
          groundingRules: {
            providedFieldsOnly: true,
            ingredientPurposeDrugClassProvided: false,
            instruction: 'Copy medication and dosage fields verbatim. Do not infer ingredient, purpose, drug class, formulation, or treatment target.',
          },
          data: capped.map((m: any) => ({
            medication: pickAiMedicationName(
              m.medicationCodeableConcept,
              m.medicationReference?.display,
            ),
            status: m.status,
            authoredOn: m.authoredOn,
            dosageInstruction: m.dosageInstruction?.[0]?.text,
            chronic: isChronicByCourseOfTherapy(m.courseOfTherapyType),
          })),
        })
      },
    }),

    getActiveMedicationList: tool({
      description: 'Shortcut for "what is the patient currently on?" — returns the deduplicated list of currently-active prescriptions (NHI refills collapsed by drug name). Set chronicOnly to filter to 慢箋.',
      inputSchema: activeMedicationsSchema,
      execute: async ({ chronicOnly }: z.infer<typeof activeMedicationsSchema>) => {
        const list = getData().collection?.medications ?? []
        const now = Date.now()
        const active = list.filter((m: any) => {
          const status = String(m.status || '').toLowerCase()
          if (['stopped', 'cancelled'].includes(status)) return false
          if (chronicOnly && !isChronicByCourseOfTherapy(m.courseOfTherapyType)) return false
          // Heuristic: filter out clearly-expired refills (authoredOn > 1 year ago AND not chronic)
          if (m.authoredOn && !isChronicByCourseOfTherapy(m.courseOfTherapyType)) {
            const age = (now - Date.parse(m.authoredOn)) / 86400000
            if (age > 365) return false
          }
          return true
        })

        const deduped = dedupMedsByName(active)
          .sort((a, b) => (b.authoredOn || '').localeCompare(a.authoredOn || ''))

        return scrub({
          success: true,
          summary: `${deduped.length} active medication(s)`,
          count: deduped.length,
          groundingRules: {
            providedFieldsOnly: true,
            ingredientPurposeDrugClassProvided: false,
            instruction: 'Copy medication and dosage fields verbatim. Do not infer ingredient, purpose, drug class, formulation, or treatment target.',
          },
          data: deduped.map((m: any) => ({
            medication: pickAiMedicationName(
              m.medicationCodeableConcept,
              m.medicationReference?.display,
            ),
            dosage: m.dosageInstruction?.[0]?.text,
            authoredOn: m.authoredOn,
            chronic: isChronicByCourseOfTherapy(m.courseOfTherapyType),
            refillCount: m.refillCount,
          })),
        })
      },
    }),

    queryAllergies: tool({
      description: 'Query patient allergies and intolerances. Filter by `severity` (high/moderate/low) to narrow to clinically significant ones.',
      inputSchema: allergiesSchema,
      execute: async ({ type, severity }: z.infer<typeof allergiesSchema>) => {
        const list = getData().collection?.allergies ?? []
        const filtered = list.filter((a: any) =>
          matchAllergyType(a.type, type) &&
          matchAllergySeverity(a.criticality, severity)
        )
        return scrub({
          success: true,
          summary: `Found ${filtered.length} AllergyIntolerance record(s)`,
          count: filtered.length,
          data: filtered.map((a: any) => ({
            substance: pickName(a.code),
            criticality: a.criticality,
            type: a.type,
            recordedDate: a.recordedDate,
          })),
        })
      },
    }),

    queryImmunizations: tool({
      description: 'Query preventive vaccinations (FHIR Immunization). Supports date range.',
      inputSchema: immunizationsSchema,
      execute: async ({ dateFrom, dateTo, limit }: z.infer<typeof immunizationsSchema>) => {
        const list = getData().collection?.immunizations ?? []
        let filtered = list
        if (dateFrom || dateTo) {
          filtered = filtered.filter((imm: any) => isWithinDateRange(imm.occurrenceDateTime, dateFrom, dateTo))
        }
        const capped = applyLimit(filtered, limit)
        return scrub({
          success: true,
          summary: `Found ${filtered.length} Immunization record(s)`,
          count: filtered.length,
          dateRange: { from: dateFrom, to: dateTo },
          data: capped.map((imm: any) => ({
            vaccine: pickName(imm.vaccineCode),
            code: imm.vaccineCode?.coding?.[0]?.code,
            status: imm.status,
            occurrenceDateTime: imm.occurrenceDateTime,
            lotNumber: imm.lotNumber,
            manufacturer: imm.manufacturer?.display,
          })),
        })
      },
    }),
  }
}
