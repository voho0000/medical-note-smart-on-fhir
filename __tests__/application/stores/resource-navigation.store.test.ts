import {
  leftTabForResourceType,
  useResourceNavigationStore,
} from '@/src/application/stores/resource-navigation.store'

describe('leftTabForResourceType', () => {
  it('maps each resource type to the left-panel tab that renders it', () => {
    expect(leftTabForResourceType('Encounter')).toBe('visits')
    expect(leftTabForResourceType('DiagnosticReport')).toBe('reports')
    expect(leftTabForResourceType('ImagingStudy')).toBe('reports')
    expect(leftTabForResourceType('Observation')).toBe('reports')
    expect(leftTabForResourceType('MedicationRequest')).toBe('meds')
    expect(leftTabForResourceType('MedicationStatement')).toBe('meds')
    expect(leftTabForResourceType('Condition')).toBe('patient')
    // Care plans render inside the 病人資訊 tab (CarePlansCard).
    expect(leftTabForResourceType('CarePlan')).toBe('patient')
    expect(leftTabForResourceType('Procedure')).toBe('visits')
    expect(leftTabForResourceType('DocumentReference')).toBe('documents')
    expect(leftTabForResourceType('Composition')).toBe('documents')
  })

  it('returns null for an unknown type (caller falls back to a toast)', () => {
    expect(leftTabForResourceType('Practitioner')).toBeNull()
  })

  it('records which navigation request the destination consumed', () => {
    useResourceNavigationStore.setState({ pending: null, seq: 0, consumedSeq: 0 })
    const store = useResourceNavigationStore.getState()

    store.navigate({ resourceType: 'Observation', resourceId: 'obs-1' })
    expect(useResourceNavigationStore.getState().seq).toBe(1)
    useResourceNavigationStore.getState().consume()

    expect(useResourceNavigationStore.getState()).toMatchObject({
      pending: null,
      seq: 1,
      consumedSeq: 1,
    })
  })
})
