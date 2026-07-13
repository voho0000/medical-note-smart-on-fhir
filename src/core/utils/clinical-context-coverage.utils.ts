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
import { inferGroupFromCategory } from '@/src/shared/utils/report-grouping-helpers'
import {
  selectLabOrphanObservations,
  selectOtherObservations,
} from '@/src/core/utils/observation-selectors'
import { scopeClinicalDataForAi } from '@/src/core/utils/ai-clinical-scope.utils'

type CoverageSource = Partial<ClinicalDataCollection>

interface CoverageRow {
  label: string
  selected: boolean
  sourceCount: number
  includedCount: number
  queryKeys: ClinicalDataQueryKey[]
}

function stateText(
  keys: ClinicalDataQueryKey[],
  statuses: Partial<Record<ClinicalDataQueryKey, ClinicalDataQueryStatus>>,
): string {
  if (keys.length === 0) return 'patient-context'
  const found = keys
    .map((key) => statuses[key] ? `${key}=${statuses[key]!.state}` : null)
    .filter((value): value is string => !!value)
  return found.length > 0 ? found.join(',') : 'local/imported-or-not-reported'
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
    const inferred = inferGroupFromCategory(report.category)
    return group === 'lab'
      ? inferred === 'lab'
      : inferred === 'imaging' || (report.imagingStudy?.length ?? 0) > 0
  }).length
}

function localIsoDay(nowMs: number): string {
  const date = new Date(nowMs)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

/**
 * Deterministic retrieval/selection manifest. Every category is named, but an
 * excluded category reveals no record count. Selected rows distinguish source
 * absence, filter-empty, query failure and included data; this is the semantic
 * information that a heading-only Markdown rewrite cannot provide.
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

  return {
    title: 'Data Coverage Manifest',
    items: [
      // Day precision is deliberate: relative medication counts are day-level,
      // and useNow refreshes on focus. Embedding the live clock would change the
      // prompt signature and invalidate cached AI results on every tab focus.
      `Export metadata: generated_at=${localIsoDay(nowMs)}; contains_phi=possible; deidentified=false. Direct-identifier masking is not guaranteed full de-identification.`,
      'Counts are FHIR source records before display grouping; status distinguishes exclusion, source absence, filtered-empty data, included data, and unavailable queries.',
      ...rows.map((row) => {
        if (!row.selected) return `${row.label}: status=excluded`
        const query = stateText(row.queryKeys, statuses)
        if (hasQueryIssue(row.queryKeys, statuses)) {
          return `${row.label}: status=unavailable; source_records=${row.sourceCount}; included_records=${row.includedCount}; query=${query}`
        }
        const status = row.sourceCount === 0
          ? 'no-source-records'
          : row.includedCount === 0
            ? 'filtered-empty'
            : 'included'
        return `${row.label}: status=${status}; source_records=${row.sourceCount}; included_records=${row.includedCount}; query=${query}`
      }),
    ],
  }
}
