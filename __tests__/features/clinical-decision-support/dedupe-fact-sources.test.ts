import { dedupeFactSources } from '@/features/clinical-decision-support/utils/dedupe-fact-sources'
import type { CdssFactSource } from '@/features/clinical-decision-support/types'

describe('dedupeFactSources', () => {
  it('keeps one source per FHIR resource identity while preserving order', () => {
    const duplicatedObservation: CdssFactSource = {
      resourceType: 'Observation',
      resourceId: '3e92a23f1f35829a89f984e4a7ba360a',
      date: '2026-06-02',
      value: 32,
      unit: 'mL/min/1.73 m²',
    }
    const sources: CdssFactSource[] = [
      duplicatedObservation,
      { ...duplicatedObservation },
      {
        resourceType: 'Observation',
        resourceId: 'other-observation',
        date: '2026-01-14',
        value: 35,
        unit: 'mL/min/1.73 m²',
      },
      {
        resourceType: 'Condition',
        resourceId: duplicatedObservation.resourceId,
      },
    ]

    expect(dedupeFactSources(sources)).toEqual([
      duplicatedObservation,
      sources[2],
      sources[3],
    ])
  })

  it('deduplicates identical display-only sources without a resource id', () => {
    const source = {
      resourceType: 'Observation' as const,
      resourceId: '',
      date: '2026-06-02',
      value: 32,
      unit: 'mL/min/1.73 m²',
    }

    expect(dedupeFactSources([source, { ...source }])).toEqual([source])
  })
})
