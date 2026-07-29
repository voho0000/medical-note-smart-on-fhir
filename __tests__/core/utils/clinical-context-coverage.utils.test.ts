import { buildClinicalContextCoverageSection } from '@/src/core/utils/clinical-context-coverage.utils'
import {
  ALL_DATA_FILTERS,
  ALL_DATA_SELECTION,
} from '@/src/shared/constants/data-selection.constants'

const NOW = Date.parse('2026-07-13T12:00:00+08:00')

describe('buildClinicalContextCoverageSection', () => {
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

    expect(section?.items).toContain('Problem List: status=unavailable; source_records=0; included_records=0; query=Condition=error')
    expect(section?.items[0]).toContain('generated_at=2026-07-13')
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

    expect(section?.items).toContain('Medications: status=excluded')
    expect(section?.items.join('\n')).not.toContain('secret-med')
    expect(section?.items.join('\n')).not.toContain('Medications: status=excluded; source_records=1')
  })

  it('adds SDK source limitations and conversion audit counts to AI context', () => {
    const section = buildClinicalContextCoverageSection(
      ALL_DATA_SELECTION,
      ALL_DATA_FILTERS,
      {
        sourceMetadata: {
          source: 'health-bank-sdk-json',
          convertedAt: '2000-01-01T00:00:00Z',
          converterVersion: '0.1.0',
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

    expect(section?.items.join('\n')).toContain('converted locally from Health Bank SDK JSON')
    expect(section?.items.join('\n')).toContain('same_day_lab_rows_merged=2')
    expect(section?.items.join('\n')).toContain('inferred_lab_units=4')
  })
})
