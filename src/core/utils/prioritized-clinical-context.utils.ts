import type { ClinicalDataCollection } from '@/src/core/entities/clinical-data.entity'
import { listClinicalDocuments } from '@/src/core/utils/clinical-documents.utils'
import {
  isMedicationCurrentlyInUse,
  normalizeClinicalStatus,
} from '@/src/core/utils/clinical-context-selection.utils'
import { inferGroupFromDiagnosticReport } from '@/src/shared/utils/report-grouping-helpers'
import { isObservationAbnormal } from '@/src/shared/utils/interpretation-helpers'
import { estimateTokens } from '@/src/shared/utils/token-estimator'

type PrioritizableCollection =
  | 'conditions'
  | 'medications'
  | 'allergies'
  | 'observations'
  | 'diagnosticReports'
  | 'imagingStudies'
  | 'procedures'
  | 'encounters'
  | 'immunizations'
  | 'consents'
  | 'devices'
  | 'carePlans'

interface RecordCandidate {
  collection: PrioritizableCollection
  id: string
  value: any
  cost: number
  score: number
  date: string
  required: boolean
}

export interface PrioritizedClinicalDataResult {
  data: Partial<ClinicalDataCollection>
  /** Token budget shared by the selected document bodies. */
  documentTokenBudget?: number
  originalRecordCount: number
  retainedRecordCount: number
  /** Relative estimates used by the deterministic record selector. Final
   * formatted text is measured separately by the caller. */
  originalEstimatedTokens: number
  retainedEstimatedTokens: number
}

const MIN_DOCUMENT_BUDGET = 2_500
const MAX_DOCUMENT_SHARE = 0.6

function resourceDate(collection: PrioritizableCollection, value: any): string {
  switch (collection) {
    case 'conditions': return value.recordedDate || value.onsetDateTime || ''
    case 'medications': return value.authoredOn || ''
    case 'allergies': return value.recordedDate || value.onsetDateTime || ''
    case 'observations': return value.effectiveDateTime || value.issued || ''
    case 'diagnosticReports': return value.effectiveDateTime || value.issued || ''
    case 'imagingStudies': return value.started || ''
    case 'procedures': return value.performedDateTime || value.performedPeriod?.start || ''
    case 'encounters': return value.period?.start || ''
    case 'immunizations': return value.occurrenceDateTime || ''
    case 'consents': return value.dateTime || ''
    case 'devices': return value.manufactureDate || ''
    case 'carePlans': return value.period?.start || value.created || ''
  }
}

function codeKey(value: any): string {
  return String(
    value?.code?.coding?.[0]?.code ||
    value?.code?.text ||
    value?.code?.coding?.[0]?.display ||
    value?.vaccineCode?.coding?.[0]?.code ||
    value?.vaccineCode?.text ||
    value?.procedureCode?.[0]?.coding?.[0]?.code ||
    value?.procedureCode?.[0]?.text ||
    value?.modality?.[0]?.code ||
    value?.modality?.[0]?.display ||
    value?.description ||
    value?.type?.coding?.[0]?.code ||
    value?.type?.text ||
    value?.id ||
    '',
  ).trim().toLowerCase()
}

function recordCost(value: any): number {
  const serialized = JSON.stringify(value, (key, nested) => {
    // Binary images and inline document attachments never enter the prompt as
    // raw base64. Counting them would crowd out all actual clinical records.
    if (key === 'data' || key === '_imageRef' || key === 'presentedForm') return undefined
    return nested
  })
  return Math.max(1, estimateTokens(serialized || ''))
}

function encounterClass(value: any): string {
  return `${value?.class?.code || ''} ${value?.class?.display || ''}`.toLowerCase()
}

function latestIdsByKey(values: any[]): Set<string> {
  const latest = new Map<string, any>()
  for (const value of values) {
    const key = codeKey(value)
    const previous = latest.get(key)
    if (!previous || resourceDate('observations', value) > resourceDate('observations', previous)) {
      latest.set(key, value)
    }
  }
  return new Set([...latest.values()].map((value) => value.id).filter(Boolean))
}

function reportMemberIds(report: any): string[] {
  return [
    ...(report.result ?? []).map((reference: any) => reference?.reference?.split('/').pop()),
    ...(report._observations ?? []).map((observation: any) => observation?.id),
  ].filter(Boolean)
}

function candidatePolicy(
  collection: PrioritizableCollection,
  value: any,
  context: {
    latestEncounterId?: string
    latestObservationIds: Set<string>
    abnormalObservationIds: Set<string>
    abnormalReportIds: Set<string>
    latestImagingReportIds: Set<string>
    latestImagingStudyIds: Set<string>
    nowMs: number
  },
): Pick<RecordCandidate, 'required' | 'score'> {
  switch (collection) {
    case 'conditions': {
      const rawStatus = typeof value.clinicalStatus === 'string'
        ? value.clinicalStatus
        : value.clinicalStatus?.coding?.[0]?.code
      const active = !rawStatus || ['active', 'recurrence', 'relapse'].includes(
        String(rawStatus).toLowerCase(),
      )
      return { required: active, score: active ? 1_000 : 680 }
    }
    case 'allergies':
    case 'consents':
    case 'devices':
      return { required: true, score: 1_000 }
    case 'carePlans': {
      const active = normalizeClinicalStatus(value.status) === 'active'
      return { required: active, score: active ? 980 : 620 }
    }
    case 'medications': {
      const current = isMedicationCurrentlyInUse(value, context.nowMs)
      return { required: current, score: current ? 990 : 520 }
    }
    case 'observations': {
      const abnormal = context.abnormalObservationIds.has(value.id)
      const latest = context.latestObservationIds.has(value.id)
      return {
        required: abnormal || latest,
        score: abnormal ? 970 : latest ? 900 : 260,
      }
    }
    case 'diagnosticReports': {
      const abnormal = context.abnormalReportIds.has(value.id)
      const latestImaging = context.latestImagingReportIds.has(value.id)
      const hasConclusion = Boolean(value.conclusion?.trim())
      return {
        required: abnormal || latestImaging,
        score: abnormal ? 950 : latestImaging ? 880 : hasConclusion ? 720 : 360,
      }
    }
    case 'imagingStudies': {
      const latest = context.latestImagingStudyIds.has(value.id)
      return { required: latest, score: latest ? 860 : 610 }
    }
    case 'encounters': {
      const importantClass = /\bimp\b|\bemer\b|inpatient|emergency|住院|急診/.test(
        encounterClass(value),
      )
      const latest = value.id === context.latestEncounterId
      return { required: latest, score: importantClass ? 800 : latest ? 820 : 300 }
    }
    case 'procedures':
      return { required: false, score: 700 }
    case 'immunizations':
      return { required: false, score: 420 }
  }
}

function latestIds(values: any[], date: (value: any) => string, key: (value: any) => string): Set<string> {
  const latest = new Map<string, any>()
  for (const value of values) {
    const group = key(value)
    const previous = latest.get(group)
    if (!previous || date(value) > date(previous)) latest.set(group, value)
  }
  return new Set([...latest.values()].map((value) => value.id).filter(Boolean))
}

/**
 * Reduce an already-scoped FHIR view record by record. Mandatory clinical
 * facts are retained first; remaining capacity is filled by clinical priority
 * and then recency. Document capacity follows its share of the original input
 * and is applied by the document formatter, so one long note cannot evict all
 * structured evidence.
 */
export function prioritizeClinicalDataForTokenBudget(
  input: Partial<ClinicalDataCollection>,
  targetTokens: number,
  originalFormattedTokens: number,
  nowMs = Date.now(),
  options: { preserveDocuments?: boolean } = {},
): PrioritizedClinicalDataResult {
  const observations = input.observations ?? []
  const abnormalObservationIds = new Set(
    observations
      .filter(isObservationAbnormal)
      .map((value) => value.id)
      .filter((id): id is string => Boolean(id)),
  )
  const latestObservationIds = latestIdsByKey(observations)
  const abnormalReportIds = new Set(
    (input.diagnosticReports ?? [])
      .filter((report) => reportMemberIds(report).some((id) => abnormalObservationIds.has(id)))
      .map((report) => report.id),
  )
  const imagingReports = (input.diagnosticReports ?? []).filter(
    (report) => inferGroupFromDiagnosticReport(report) === 'imaging',
  )
  const latestImagingReportIds = latestIds(
    imagingReports,
    (value) => resourceDate('diagnosticReports', value),
    codeKey,
  )
  const latestImagingStudyIds = latestIds(
    input.imagingStudies ?? [],
    (value) => resourceDate('imagingStudies', value),
    codeKey,
  )
  const latestEncounterId = [...(input.encounters ?? [])]
    .sort((left, right) => resourceDate('encounters', right).localeCompare(
      resourceDate('encounters', left),
    ))[0]?.id

  const context = {
    latestEncounterId,
    latestObservationIds,
    abnormalObservationIds,
    abnormalReportIds,
    latestImagingReportIds,
    latestImagingStudyIds,
    nowMs,
  }
  const collections: PrioritizableCollection[] = [
    'conditions',
    'medications',
    'allergies',
    'observations',
    'diagnosticReports',
    'imagingStudies',
    'procedures',
    'encounters',
    'immunizations',
    'consents',
    'devices',
    'carePlans',
  ]
  const candidates = collections.flatMap((collection) =>
    ((input[collection] ?? []) as any[]).map((value, index) => ({
      collection,
      id: value.id || `${collection}-${index}`,
      value,
      cost: recordCost(value),
      date: resourceDate(collection, value),
      ...candidatePolicy(collection, value, context),
    })),
  )

  const documents = listClinicalDocuments(input)
  const documentCosts = documents.map((document) => ({
    id: document.id,
    cost: Math.max(1, estimateTokens(`${document.title}\n${document.text}`)),
  }))
  const recordCostTotal = candidates.reduce((sum, candidate) => sum + candidate.cost, 0)
  const documentCostTotal = documentCosts.reduce((sum, document) => sum + document.cost, 0)
  const totalCost = Math.max(1, recordCostTotal + documentCostTotal)
  const retentionRatio = Math.min(1, Math.max(0.01, targetTokens / Math.max(1, originalFormattedTokens)))
  const estimatedBudget = Math.max(1, Math.floor(totalCost * retentionRatio))
  const rawDocumentShare = documentCostTotal / totalCost
  const documentShare = documents.length === 0
    ? 0
    : Math.min(MAX_DOCUMENT_SHARE, rawDocumentShare)
  // Explicit selections reserve their full text first. Required safety records
  // remain mandatory even if the result overflows; preflight must report that
  // conflict instead of silently dropping documents or clinical safety facts.
  const nonDocumentBudget = options.preserveDocuments
    ? Math.floor(recordCostTotal * Math.min(1,
        Math.max(0, targetTokens - documentCostTotal) /
        Math.max(1, originalFormattedTokens - documentCostTotal)))
    : Math.max(1, Math.floor(estimatedBudget * (1 - documentShare)))

  const required = candidates.filter((candidate) => candidate.required)
  const optional = candidates
    .filter((candidate) => !candidate.required)
    .sort((left, right) => (
      right.score - left.score ||
      right.date.localeCompare(left.date) ||
      left.cost - right.cost
    ))
  const selected = new Set(required.map((candidate) => `${candidate.collection}:${candidate.id}`))
  let used = required.reduce((sum, candidate) => sum + candidate.cost, 0)
  for (const candidate of optional) {
    if (used + candidate.cost > nonDocumentBudget) continue
    selected.add(`${candidate.collection}:${candidate.id}`)
    used += candidate.cost
  }

  const selectedDocumentIds = new Set<string>()
  const documentCostBudget = Math.max(1, Math.floor(estimatedBudget * documentShare))
  let usedDocumentCost = 0
  for (const document of documentCosts) {
    if (options.preserveDocuments || selectedDocumentIds.size === 0 || usedDocumentCost + document.cost <= documentCostBudget) {
      selectedDocumentIds.add(document.id)
      usedDocumentCost += document.cost
    }
  }
  const documentTokenBudget = options.preserveDocuments || documents.length === 0
    ? undefined
    : Math.min(
        documentCostTotal,
        Math.max(MIN_DOCUMENT_BUDGET, Math.floor(targetTokens * documentShare)),
      )

  const selectedObservationIds = new Set(
    candidates
      .filter((candidate) => candidate.collection === 'observations')
      .filter((candidate) => selected.has(`observations:${candidate.id}`))
      .map((candidate) => candidate.id),
  )
  const selectedReportIds = new Set(
    candidates
      .filter((candidate) => candidate.collection === 'diagnosticReports')
      .filter((candidate) => (
        selected.has(`diagnosticReports:${candidate.id}`) ||
        reportMemberIds(candidate.value).some((id) => selectedObservationIds.has(id))
      ))
      .map((candidate) => candidate.id),
  )

  const data: Partial<ClinicalDataCollection> = {
    ...input,
    ...Object.fromEntries(collections.map((collection) => [
      collection,
      ((input[collection] ?? []) as any[]).filter((value, index) => {
        const id = value.id || `${collection}-${index}`
        if (collection === 'diagnosticReports') return selectedReportIds.has(id)
        return selected.has(`${collection}:${id}`)
      }),
    ])),
    diagnosticReports: (input.diagnosticReports ?? [])
      .filter((value) => selectedReportIds.has(value.id))
      .map((value) => ({
        ...value,
        // A report may carry the same observations both as references and as
        // re-attached objects. Prune both paths or a dropped old normal value
        // would silently re-enter the formatted lab section.
        result: value.result?.filter((reference) => {
          const id = reference.reference?.split('/').pop()
          return Boolean(id && selectedObservationIds.has(id))
        }),
        _observations: value._observations?.filter((observation) => (
          !observation.id || selectedObservationIds.has(observation.id)
        )),
      })),
    vitalSigns: (input.vitalSigns ?? []).filter((value) => (
      !value.id || selectedObservationIds.has(value.id)
    )),
    compositions: (input.compositions ?? []).filter((value) => selectedDocumentIds.has(value.id)),
    documentReferences: (input.documentReferences ?? []).filter((value) => (
      selectedDocumentIds.has(value.id)
    )),
  }
  const retainedEstimatedTokens = collections.reduce(
    (sum, collection) => sum + ((data[collection] ?? []) as any[])
      .reduce((collectionSum, value) => collectionSum + recordCost(value), 0),
    options.preserveDocuments ? documentCostTotal : Math.min(documentCostTotal, documentTokenBudget ?? 0),
  )

  return {
    data,
    documentTokenBudget,
    originalRecordCount: candidates.length + documents.length,
    retainedRecordCount: collections.reduce(
      (sum, collection) => sum + ((data[collection] ?? []) as any[]).length,
      (data.compositions?.length ?? 0) + (data.documentReferences?.length ?? 0),
    ),
    originalEstimatedTokens: totalCost,
    retainedEstimatedTokens,
  }
}
