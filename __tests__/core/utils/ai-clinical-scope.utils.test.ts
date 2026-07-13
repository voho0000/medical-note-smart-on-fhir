import { scopeClinicalDataForAi } from '@/src/core/utils/ai-clinical-scope.utils'
import {
  ALL_DATA_FILTERS,
  ALL_DATA_SELECTION,
} from '@/src/shared/constants/data-selection.constants'

const NOW = Date.parse('2026-07-13T12:00:00+08:00')

describe('scopeClinicalDataForAi', () => {
  const input = {
    encounters: [
      { id: 'recent-visit', period: { start: '2026-07-01' } },
      { id: 'old-visit', period: { start: '2020-01-01' } },
      { id: 'undated-visit' },
    ],
    medications: [
      { id: 'active-med', status: 'active', authoredOn: '2026-07-01', medicationCodeableConcept: { text: 'Active drug' } },
      { id: 'bad-med', status: 'entered-in-error', authoredOn: '2026-07-01', medicationCodeableConcept: { text: 'Invalid drug' } },
    ],
    procedures: [{ id: 'procedure', status: 'completed', performedDateTime: '2026-07-02' }],
    allergies: [{ id: 'allergy' }],
    diagnosticReports: [{
      id: 'lab-report',
      status: 'final',
      category: [{ coding: [{ code: 'LAB' }] }],
      effectiveDateTime: '2026-07-02',
    }],
    documentReferences: [
      { id: 'selected-doc' },
      { id: 'excluded-doc' },
    ],
  } as any

  it('removes deselected categories from every structured AI side channel', () => {
    const selection = {
      ...ALL_DATA_SELECTION,
      medications: false,
      allergies: false,
      labReports: false,
      procedures: false,
    }
    const scoped = scopeClinicalDataForAi(input, selection, ALL_DATA_FILTERS, ['selected-doc'], NOW)

    expect(scoped.medications).toEqual([])
    expect(scoped.allergies).toEqual([])
    expect(scoped.procedures).toEqual([])
    expect(scoped.diagnosticReports).toEqual([])
    expect(scoped.documentReferences?.map((document) => document.id)).toEqual(['selected-doc'])
  })

  it('applies the same bounded visit and active-medication semantics used by the context', () => {
    const filters = {
      ...ALL_DATA_FILTERS,
      encounterTimeRange: '1m' as const,
      medicationStatus: 'active' as const,
      medicationTimeRange: '1m' as const,
    }
    const scoped = scopeClinicalDataForAi(input, ALL_DATA_SELECTION, filters, [], NOW)

    expect(scoped.encounters?.map((encounter) => encounter.id)).toEqual(['recent-visit'])
    expect(scoped.medications?.map((medication) => medication.id)).toEqual(['active-med'])
  })

  it('keeps report-member observations when the lab section uses its empty-window fallback', () => {
    const labInput = {
      observations: [{
        id: 'old-creatinine',
        status: 'final',
        effectiveDateTime: '2020-01-01',
        code: { text: 'CREA' },
        valueQuantity: { value: 1.4, unit: 'mg/dL' },
      }],
      diagnosticReports: [{
        id: 'old-lab-report',
        status: 'final',
        effectiveDateTime: '2020-01-01',
        category: [{ coding: [{ code: 'LAB' }] }],
        result: [{ reference: 'Observation/old-creatinine' }],
      }],
    } as any
    const filters = {
      ...ALL_DATA_FILTERS,
      labReportTimeRange: '1m' as const,
      labDepth: 'latest' as const,
    }
    const scoped = scopeClinicalDataForAi(labInput, ALL_DATA_SELECTION, filters, [], NOW)

    expect(scoped.diagnosticReports?.map((report) => report.id)).toEqual(['old-lab-report'])
    expect(scoped.observations?.map((observation) => observation.id)).toContain('old-creatinine')
  })

  it('does not reintroduce a lab panel excluded by the panel filter', () => {
    const labInput = {
      observations: [{
        id: 'creatinine',
        status: 'final',
        effectiveDateTime: '2026-07-01',
        code: { text: 'CREA' },
        valueQuantity: { value: 1.4, unit: 'mg/dL' },
      }],
      diagnosticReports: [{
        id: 'chem-report',
        status: 'final',
        effectiveDateTime: '2026-07-01',
        category: [{ coding: [{ code: 'LAB' }] }],
        result: [{ reference: 'Observation/creatinine' }],
      }],
    } as any
    const scoped = scopeClinicalDataForAi(
      labInput,
      ALL_DATA_SELECTION,
      { ...ALL_DATA_FILTERS, labPanelIds: 'cbc' },
      [],
      NOW,
    )

    expect(scoped.diagnosticReports).toEqual([])
    expect(scoped.observations).toEqual([])
  })

  it('applies latest-per-study-name to standalone ImagingStudy sources', () => {
    const imagingInput = {
      imagingStudies: [
        { id: 'old-ct', started: '2024-01-01', description: 'Chest CT' },
        { id: 'new-ct', started: '2026-01-01', description: 'Chest CT' },
        { id: 'xray', started: '2025-01-01', description: 'Chest X-ray' },
      ],
    } as any
    const scoped = scopeClinicalDataForAi(
      imagingInput,
      ALL_DATA_SELECTION,
      { ...ALL_DATA_FILTERS, imagingReportVersion: 'latest' },
      [],
      NOW,
    )

    expect(scoped.imagingStudies?.map((study) => study.id).sort()).toEqual(['new-ct', 'xray'])
  })
})
