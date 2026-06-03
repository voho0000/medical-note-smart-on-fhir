// Regression locks for useEncounterDetails test grouping. A single visit's
// lab observations arrive interleaved from multiple DiagnosticReports /
// standalone Observations; the hook must cluster them into clinically ordered
// category groups (血液 before 生化 …) and sort within each group by the
// category's preferredOrder — otherwise CBC and biochem mix together, which
// is what users reported looked clinically wrong.
import { renderHook } from '@testing-library/react'
import { useEncounterDetails } from '@/features/clinical-summary/visit-history/hooks/useEncounterDetails'

const obs = (id: string, text: string) => ({
  id,
  encounter: { reference: 'Encounter/e1' },
  code: { text },
  valueQuantity: { value: 1, unit: 'x' },
  effectiveDateTime: '2026-05-01T00:00:00Z',
})

function run(observations: any[]) {
  const { result } = renderHook(() =>
    useEncounterDetails([], [], observations, [], [], [], 'en', 'medical'),
  )
  return result.current.get('e1')!
}

describe('useEncounterDetails — clinical category grouping', () => {
  it('clusters interleaved CBC + biochem obs into ordered category groups', () => {
    // Deliberately interleaved: K (chem), RBC (cbc), Na (chem), WBC (cbc).
    const details = run([obs('o1', 'K'), obs('o2', 'RBC'), obs('o3', 'Na'), obs('o4', 'WBC')])

    // Two groups, cbc before chem (clinical reading order).
    expect(details.testGroups.map((g) => g.categoryId)).toEqual(['cbc', 'chem'])

    // Within cbc: WBC before RBC (preferredOrder). Within chem: Na before K.
    expect(details.testGroups[0].tests.map((t) => t.sortKey)).toEqual(['WBC', 'RBC'])
    expect(details.testGroups[1].tests.map((t) => t.sortKey)).toEqual(['NA', 'K'])
  })

  it('flat tests list is preserved for stats/search alongside groups', () => {
    const details = run([obs('o1', 'Na'), obs('o2', 'WBC')])
    expect(details.tests).toHaveLength(2)
    expect(details.testGroups.reduce((n, g) => n + g.tests.length, 0)).toBe(2)
  })

  it('tags each test with its category id for grouping', () => {
    const details = run([obs('o1', 'WBC')])
    expect(details.tests[0].categoryId).toBe('cbc')
    expect(details.tests[0].sortKey).toBe('WBC')
  })

  it('uncategorized tests fall into a trailing null group', () => {
    // A free-text / non-canonical row has no lab category.
    const details = run([obs('o1', 'WBC'), obs('o2', 'Aerobic culture, Sputum')])
    const ids = details.testGroups.map((g) => g.categoryId)
    expect(ids[0]).toBe('cbc')
    expect(ids[ids.length - 1]).toBeNull()
  })
})
