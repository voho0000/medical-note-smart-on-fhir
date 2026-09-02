import { buildClinicalContextCoverageSection } from '@/src/core/utils/clinical-context-coverage.utils'
import {
  ALL_DATA_FILTERS,
  ALL_DATA_SELECTION,
} from '@/src/shared/constants/data-selection.constants'

const NOW = Date.parse('2026-07-13T12:00:00+08:00')

describe('buildClinicalContextCoverageSection', () => {
  beforeAll(() => {
    jest.useFakeTimers()
    jest.setSystemTime(NOW)
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  it('distinguishes a successful empty query from a failed query', () => {
    const section = buildClinicalContextCoverageSection(
      {
        ...ALL_DATA_SELECTION,
        encounters: false,
        labReports: false,
        imagingReports: false,
        procedures: false,
        observations: false,
        medications: false,
        allergies: false,
        immunizations: false,
        documents: false,
        vitalSigns: false,
        advanceDirectives: false,
        medicalDevices: false,
        carePlans: false,
      },
      ALL_DATA_FILTERS,
      {
        conditions: [],
        resourceQueryStatus: {
          Condition: { state: 'error', message: 'FHIR unavailable' },
        },
      } as any,
      [],
      NOW,
    )

    expect(section?.items).toContain('Data unavailable because its query did not complete successfully: Problem List.')
    expect(section?.items).toContain('Missing source data does not confirm clinical absence.')
    expect(section?.items.join('\n')).not.toContain('generated_at')
    expect(section?.items.join('\n')).not.toContain('query=')
    expect(section?.items.join('\n')).not.toContain('FHIR unavailable')
  })

  it('does not disclose counts for categories the user excluded', () => {
    const section = buildClinicalContextCoverageSection(
      { ...ALL_DATA_SELECTION, medications: false },
      ALL_DATA_FILTERS,
      { medications: [{ id: 'secret-med' }] } as any,
      [],
      NOW,
    )

    expect(section?.items).toContain('Excluded by user selection: Medications.')
    expect(section?.items.join('\n')).not.toContain('secret-med')
    expect(section?.items.join('\n')).not.toContain('secret-med')
    expect(section?.items.join('\n')).not.toContain('source_records')
  })

  it('adds a compact SDK source limitation without engineering audit telemetry', () => {
    const section = buildClinicalContextCoverageSection(
      ALL_DATA_SELECTION,
      ALL_DATA_FILTERS,
      {
        sourceMetadata: {
          source: 'health-bank-sdk-json',
          convertedAt: '2000-01-01T00:00:00Z',
          converterVersion: '0.1.4',
          resourceCounts: {},
          warnings: [],
          labDuplicateMerge: {
            sourceCount: 5,
            convertedCount: 3,
            mergedCount: 2,
            conflictingValueGroupCount: 1,
          },
          unitInference: {
            policyVersion: 'sdk-unit-policy-v1',
            inferredCount: 4,
            unitlessCount: 1,
            unresolvedCount: 1,
          },
          sourceCapabilities: [],
        },
      } as any,
      [],
      NOW,
    )

    const context = section?.items.join('\n')
    expect(context).toContain('Health Bank SDK conversion limitation')
    expect(context).toContain('structured demographics, medication dosage, and some laboratory metadata may be unavailable')
    expect(context).toContain('report-text demographics are not verified Patient fields')
    expect(context).not.toContain('converter_version=')
    expect(context).not.toContain('evidence_qualified_lab_duplicates_merged=')
    expect(context).not.toContain('inferred_lab_units=')
  })

  it('warns AI context that legacy SDK conversions may have dropped distinct values', () => {
    const section = buildClinicalContextCoverageSection(
      ALL_DATA_SELECTION,
      ALL_DATA_FILTERS,
      {
        sourceMetadata: {
          source: 'health-bank-sdk-json',
          converterVersion: '0.1.2',
          labDuplicateMerge: {
            sourceCount: 10,
            convertedCount: 7,
            mergedCount: 3,
            conflictingValueGroupCount: 2,
          },
          unitInference: {
            policyVersion: 'sdk-unit-policy-v1',
            inferredCount: 0,
            unitlessCount: 7,
            unresolvedCount: 7,
          },
          sourceCapabilities: [],
          warnings: [],
          resourceCounts: {},
        },
      } as any,
      [],
      NOW,
    )

    const context = section?.items.join('\n')
    expect(context).toContain('Legacy SDK converter 0.1.2 may have dropped distinct same-day laboratory values')
    expect(context).toContain('re-import the original SDK JSON with converter 0.1.3 or later')
    expect(context).not.toContain('legacy_same_day_lab_rows_merged=')
  })

  it('collapses normal counts, absent categories, and filter reductions into compact lines', () => {
    const section = buildClinicalContextCoverageSection(
      ALL_DATA_SELECTION,
      { ...ALL_DATA_FILTERS, encounterTimeRange: '1m' },
      {
        encounters: [
          { id: 'recent', period: { start: '2026-07-01' } },
          { id: 'old', period: { start: '2020-01-01' } },
        ],
        medications: [{ id: 'med', status: 'active', authoredOn: '2026-07-01' }],
      } as any,
      [],
      NOW,
    )

    expect(section?.title).toBe('Data Scope')
    expect(section?.items[0]).toContain('Patient Information 1')
    expect(section?.items[0]).toContain('Visits 1 (grouped for display)')
    expect(section?.items[0]).toContain('Medications 1')
    expect(section?.items).toContain('Filtered by selected scope: Visits 2→1.')
    expect(section?.items.join('\n')).toContain('Not present in supplied data:')
    expect(section?.items.join('\n')).not.toContain('status=')
    expect(section?.items.join('\n')).not.toContain('source_records=')
  })
})
