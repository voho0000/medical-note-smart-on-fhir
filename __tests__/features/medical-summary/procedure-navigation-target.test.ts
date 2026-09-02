import { resolveProcedureNavigationTarget } from '@/features/medical-summary/utils/procedure-navigation-target'

describe('resolveProcedureNavigationTarget', () => {
  it('attaches the parent encounter for a linked procedure', () => {
    expect(resolveProcedureNavigationTarget({
      resourceType: 'Procedure',
      resourceId: 'procedure-1',
    }, [{
      id: 'procedure-1',
      encounter: { reference: 'Encounter/visit-1' },
    }])).toEqual({
      resourceType: 'Procedure',
      resourceId: 'procedure-1',
      encounterId: 'visit-1',
    })
  })

  it('leaves standalone procedures unlinked for Reports routing', () => {
    const target = {
      resourceType: 'Procedure',
      resourceId: 'procedure-standalone',
    }
    expect(resolveProcedureNavigationTarget(target, [{
      id: 'procedure-standalone',
    }])).toBe(target)
  })
})
