import type {
  ClinicalContextSection,
  DataFilters,
  DataSelection,
} from '@/src/core/entities/clinical-context.entity'
import type {
  ClinicalDataCollection,
  ClinicalDataQueryKey,
  ClinicalDataQueryStatus,
} from '@/src/core/entities/clinical-data.entity'
import {
  inferGroupFromCategory,
  inferGroupFromDiagnosticReport,
} from '@/src/shared/utils/report-grouping-helpers'
import {
  selectLabOrphanObservations,
  selectOtherObservations,
} from '@/src/core/utils/observation-selectors'
import { scopeClinicalDataForAi } from '@/src/core/utils/ai-clinical-scope.utils'
import { sdkPreservesDistinctSameDayLabResults } from '@/src/shared/utils/sdk-converter-version.utils'

type CoverageSource = Partial<ClinicalDataCollection>

interface CoverageRow {
  label: string
  selected: boolean
  sourceCount: number
  includedCount: number
  queryKeys: ClinicalDataQueryKey[]
}

function hasQueryIssue(
  keys: ClinicalDataQueryKey[],
  statuses: Partial<Record<ClinicalDataQueryKey, ClinicalDataQueryStatus>>,
): boolean {
  return keys.some((key) => {
    const state = statuses[key]?.state
    return !!state && state !== 'ok' && state !== 'empty'
  })
}

function reportCount(source: CoverageSource, group: 'lab' | 'imaging'): number {
  return (source.diagnosticReports ?? []).filter((report) => {
    return group === 'lab'
      ? inferGroupFromCategory(report.category) === 'lab'
      : inferGroupFromDiagnosticReport(report) === 'imaging'
  }).length
}

/**
 * Compact retrieval/selection scope for the LLM. Detailed rows stay local in
 * this deterministic calculation, while the prompt receives only useful
 * counts and exceptions instead of engineering telemetry for every category.
 */
export function buildClinicalContextCoverageSection(
  selection: DataSelection,
  filters: DataFilters,
  data: CoverageSource | null | undefined,
  selectedDocumentIds: string[],
  nowMs = Date.now(),
): ClinicalContextSection | null {
  if (!data) return null
  const statuses = data.resourceQueryStatus ?? {}
  const scoped = scopeClinicalDataForAi(data, selection, filters, selectedDocumentIds, nowMs)
  const sourceDocumentCount = (data.compositions?.length ?? 0) + (data.documentReferences?.length ?? 0)
  const includedDocumentCount = (scoped.compositions?.length ?? 0) + (scoped.documentReferences?.length ?? 0)
  const rows: CoverageRow[] = [
    { label: 'Patient Information', selected: selection.patientInfo, sourceCount: 1, includedCount: selection.patientInfo ? 1 : 0, queryKeys: [] },
    { label: 'Problem List', selected: selection.problemList, sourceCount: data.conditions?.length ?? 0, includedCount: scoped.conditions?.length ?? 0, queryKeys: ['Condition'] },
    { label: 'Vital Signs', selected: selection.vitalSigns, sourceCount: data.vitalSigns?.length ?? 0, includedCount: scoped.vitalSigns?.length ?? 0, queryKeys: ['Observation:vital-signs'] },
    { label: 'Advance Directives', selected: selection.advanceDirectives, sourceCount: data.consents?.length ?? 0, includedCount: scoped.consents?.length ?? 0, queryKeys: ['Consent'] },
    { label: 'Medical Devices', selected: selection.medicalDevices, sourceCount: data.devices?.length ?? 0, includedCount: scoped.devices?.length ?? 0, queryKeys: ['Device'] },
    { label: 'Care Plans', selected: selection.carePlans, sourceCount: data.carePlans?.length ?? 0, includedCount: scoped.carePlans?.length ?? 0, queryKeys: ['CarePlan'] },
    { label: 'Visits', selected: selection.encounters, sourceCount: data.encounters?.length ?? 0, includedCount: scoped.encounters?.length ?? 0, queryKeys: ['Encounter'] },
    {
      label: 'Lab Results',
      selected: selection.labReports,
      sourceCount: reportCount(data, 'lab') + selectLabOrphanObservations(data).length,
      includedCount: reportCount(scoped, 'lab') + selectLabOrphanObservations(scoped).length,
      queryKeys: ['DiagnosticReport', 'Observation'],
    },
    {
      label: 'Imaging',
      selected: selection.imagingReports,
      sourceCount: reportCount(data, 'imaging') + (data.imagingStudies?.length ?? 0),
      includedCount: reportCount(scoped, 'imaging') + (scoped.imagingStudies?.length ?? 0),
      queryKeys: ['DiagnosticReport', 'ImagingStudy'],
    },
    { label: 'Procedures', selected: selection.procedures, sourceCount: data.procedures?.length ?? 0, includedCount: scoped.procedures?.length ?? 0, queryKeys: ['Procedure'] },
    { label: 'Other Observations', selected: selection.observations, sourceCount: selectOtherObservations(data).length, includedCount: selectOtherObservations(scoped).length, queryKeys: ['Observation'] },
    { label: 'Medications', selected: selection.medications, sourceCount: data.medications?.length ?? 0, includedCount: scoped.medications?.length ?? 0, queryKeys: ['MedicationRequest', 'MedicationStatement'] },
    { label: 'Allergies', selected: selection.allergies, sourceCount: data.allergies?.length ?? 0, includedCount: scoped.allergies?.length ?? 0, queryKeys: ['AllergyIntolerance'] },
    { label: 'Immunizations', selected: selection.immunizations, sourceCount: data.immunizations?.length ?? 0, includedCount: scoped.immunizations?.length ?? 0, queryKeys: ['Immunization'] },
    { label: 'Documents', selected: selection.documents, sourceCount: sourceDocumentCount, includedCount: includedDocumentCount, queryKeys: ['Composition', 'DocumentReference'] },
  ]
  const sdkMetadata = data.sourceMetadata?.source === 'health-bank-sdk-json'
    ? data.sourceMetadata
    : null
  const included = rows.filter((row) => row.selected && row.includedCount > 0)
  const absent = rows.filter((row) =>
    row.selected
    && row.sourceCount === 0
    && !hasQueryIssue(row.queryKeys, statuses),
  )
  const excluded = rows.filter((row) => !row.selected)
  const filtered = rows.filter((row) =>
    row.selected
    && row.sourceCount > row.includedCount
    && !hasQueryIssue(row.queryKeys, statuses),
  )
  const unavailable = rows.filter((row) =>
    row.selected && hasQueryIssue(row.queryKeys, statuses),
  )

  const items: string[] = []
  if (included.length > 0) {
    items.push(`Included source records: ${included.map((row) =>
      `${row.label} ${row.includedCount}${row.label === 'Visits' ? ' (grouped for display)' : ''}`
    ).join('; ')}.`)
  }
  if (absent.length > 0) {
    items.push(`Not present in supplied data: ${absent.map((row) => row.label).join(', ')}.`)
  }
  if (excluded.length > 0) {
    items.push(`Excluded by user selection: ${excluded.map((row) => row.label).join(', ')}.`)
  }
  if (filtered.length > 0) {
    items.push(`Filtered by selected scope: ${filtered.map((row) =>
      `${row.label} ${row.sourceCount}→${row.includedCount}`
    ).join('; ')}.`)
  }
  if (unavailable.length > 0) {
    items.push(`Data unavailable because its query did not complete successfully: ${unavailable.map((row) => row.label).join(', ')}.`)
  }
  if (absent.length > 0 || unavailable.length > 0) {
    items.push('Missing source data does not confirm clinical absence.')
  }
  if (sdkMetadata) {
    items.push('Health Bank SDK conversion limitation: structured demographics, medication dosage, and some laboratory metadata may be unavailable; report-text demographics are not verified Patient fields.')
    if (!sdkPreservesDistinctSameDayLabResults(sdkMetadata.converterVersion)) {
      items.push(`Legacy SDK converter ${sdkMetadata.converterVersion} may have dropped distinct same-day laboratory values; re-import the original SDK JSON with converter 0.1.3 or later before relying on laboratory completeness.`)
    }
  }

  return {
    title: 'Data Scope',
    items,
  }
}
