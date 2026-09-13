import { buildLabPivots } from '@/src/shared/utils/lab-pivot.utils'
import { categorizeObservation } from '@/src/shared/utils/lab-categories'

describe('MediCloud text-only hepatitis screening', () => {
  it('keeps preventive provenance through same-day merges without marking unrelated dates', () => {
    const base = { code: { text: 'HBsAg' }, valueCodeableConcept: { text: '陰性' } }
    const pivots = buildLabPivots([
      { ...base, effectiveDateTime: '2024-03-12', meta: { tag: [{ system: 'http://nhi-fhir-bridge/source-program', code: 'adult-preventive' }] } },
      { ...base, effectiveDateTime: '2024-03-12' },
      { ...base, effectiveDateTime: '2023-03-12' },
    ])
    const row = pivots.hep.rows.find(row => row.testKey === 'HBSAG')!
    expect(row.values.get('2024-03-12')?.adultPreventive).toBe(true)
    expect(row.values.get('2023-03-12')?.adultPreventive).toBeUndefined()
  })
  it.each(['B型肝炎表面抗原(HBsAg)', 'C型肝炎抗體(Anti-HCV)'])('places %s in the existing hepatitis panel', (text) => {
    const observation = {
      id: 'synthetic-screening', status: 'unknown', code: { text },
      effectiveDateTime: '2024-03-12', valueCodeableConcept: { text: '陰性' },
    }
    expect(categorizeObservation(observation)?.id).toBe('hep')
    const pivots = buildLabPivots([observation])
    const key = text.startsWith('B') ? 'HBSAG' : 'ANTI-HCV'
    expect(pivots.hep.rows.find(row => row.testKey === key)?.values.get('2024-03-12')?.value).toBe('陰性')
  })
})
