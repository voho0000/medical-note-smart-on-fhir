/**
 * A switch is a statement about one person's chart.
 *
 * Two properties are worth a test because getting either wrong reads as a
 * considered clinical judgement rather than as a bug: the switches survive a
 * reload, and they never leak from one patient into the next.
 */
import {
  evidenceOverridesStorageKey,
  getEvidenceOverrides,
  useEvidenceOverridesStore,
} from '@/features/clinical-decision-support/stores/evidence-overrides.store'

function resetStore() {
  useEvidenceOverridesStore.setState({ byPatientId: {} })
  window.localStorage.clear()
}

describe('evidence override store', () => {
  beforeEach(resetStore)

  it('records a switch per patient and keeps patients apart', () => {
    const { setOverride } = useEvidenceOverridesStore.getState()

    setOverride('patient-a', 'congestion:cxr', false)
    setOverride('patient-b', 'congestion:jvp', true)

    expect(getEvidenceOverrides('patient-a')).toEqual({ 'congestion:cxr': false })
    expect(getEvidenceOverrides('patient-b')).toEqual({ 'congestion:jvp': true })
  })

  it('persists under a key namespaced by patient id', () => {
    useEvidenceOverridesStore.getState().setOverride('patient-a', 'congestion:cxr', false)

    const raw = window.localStorage.getItem(evidenceOverridesStorageKey('patient-a'))
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw as string)).toEqual({ 'congestion:cxr': false })
    expect(window.localStorage.getItem(evidenceOverridesStorageKey('patient-b'))).toBeNull()
  })

  it('reads the stored switches back after a reload', () => {
    useEvidenceOverridesStore.getState().setOverride('patient-a', 'congestion:cxr', false)

    // A reload keeps localStorage and loses the in-memory store.
    useEvidenceOverridesStore.setState({ byPatientId: {} })
    useEvidenceOverridesStore.getState().hydrate('patient-a')

    expect(useEvidenceOverridesStore.getState().byPatientId['patient-a'])
      .toEqual({ 'congestion:cxr': false })
  })

  it('hydrates only once, so a stored value never overwrites a newer switch', () => {
    const { hydrate, setOverride } = useEvidenceOverridesStore.getState()
    window.localStorage.setItem(
      evidenceOverridesStorageKey('patient-a'),
      JSON.stringify({ 'congestion:cxr': false }),
    )

    hydrate('patient-a')
    setOverride('patient-a', 'congestion:cxr', true)
    hydrate('patient-a')

    expect(getEvidenceOverrides('patient-a')).toEqual({ 'congestion:cxr': true })
  })

  it('clears one patient without touching another', () => {
    const { clearOverrides, setOverride } = useEvidenceOverridesStore.getState()
    setOverride('patient-a', 'congestion:cxr', false)
    setOverride('patient-b', 'congestion:jvp', true)

    clearOverrides('patient-a')

    expect(getEvidenceOverrides('patient-a')).toEqual({})
    expect(window.localStorage.getItem(evidenceOverridesStorageKey('patient-a'))).toBeNull()
    expect(getEvidenceOverrides('patient-b')).toEqual({ 'congestion:jvp': true })
  })

  it('degrades to no overrides when storage holds something unusable', () => {
    window.localStorage.setItem(evidenceOverridesStorageKey('patient-a'), 'not json')
    useEvidenceOverridesStore.getState().hydrate('patient-a')
    expect(useEvidenceOverridesStore.getState().byPatientId['patient-a']).toEqual({})

    resetStore()
    window.localStorage.setItem(
      evidenceOverridesStorageKey('patient-a'),
      JSON.stringify({ 'congestion:cxr': 'no', 'congestion:jvp': true }),
    )
    useEvidenceOverridesStore.getState().hydrate('patient-a')
    expect(useEvidenceOverridesStore.getState().byPatientId['patient-a'])
      .toEqual({ 'congestion:jvp': true })
  })

  it('keeps a switch for the session when storage refuses the write', () => {
    const storage = window.localStorage
    const original = storage.setItem
    storage.setItem = () => {
      throw new Error('QuotaExceededError')
    }

    try {
      useEvidenceOverridesStore.getState().setOverride('patient-a', 'congestion:cxr', false)
      expect(useEvidenceOverridesStore.getState().byPatientId['patient-a'])
        .toEqual({ 'congestion:cxr': false })
    } finally {
      storage.setItem = original
    }
  })
})
