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
})
