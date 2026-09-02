import {
  buildClinicalTemporalReferenceSection,
  latestClinicalRecordDate,
} from '@/src/core/utils/clinical-temporal-reference.utils'

describe('clinical temporal reference', () => {
  const data = {
    encounters: [{ period: { start: '2026-08-20', end: '2026-08-21' } }],
    medications: [{ authoredOn: '2026-07-01' }],
    observations: [{ effectiveDateTime: '2026-08-25T09:00:00+08:00' }],
    documentReferences: [{ date: '2026-08-23T12:00:00+08:00' }],
  }

  it('finds the latest dated clinical event rather than export metadata', () => {
    expect(latestClinicalRecordDate({
      ...data,
      sourceMetadata: { generatedAt: '2026-09-03' },
    })).toBe('2026-08-25')
  })

  it('states both the reference date and latest record date with evidence semantics', () => {
    const section = buildClinicalTemporalReferenceSection(
      data,
      Date.parse('2026-09-03T12:00:00+08:00'),
    )

    expect(section).toEqual({
      title: 'Clinical Time Reference',
      items: [
        'Clinical reference date: 2026-09-03. Use this date for medication supply and recency calculations.',
        'Latest available clinical record date: 2026-08-25.',
        '“Currently evidenced” means supported by the supplied claims as of the clinical reference date; it does not confirm actual medication use or non-use.',
      ],
    })
  })
})
