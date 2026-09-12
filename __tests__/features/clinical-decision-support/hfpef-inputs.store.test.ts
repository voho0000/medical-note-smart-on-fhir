/**
 * The echo values a clinician typed: kept per patient, dated by the change.
 */
import {
  buildHfpefInputs,
  hfpefInputsStorageKey,
  mergeHfpefInputs,
  useHfpefInputsStore,
} from '@/features/clinical-decision-support/stores/hfpef-inputs.store'

const FIRST = new Date('2026-09-12T14:09:00+08:00')
const LATER = new Date('2026-09-12T14:30:00+08:00')

describe('the typed HFpEF inputs', () => {
  beforeEach(() => {
    localStorage.clear()
    useHfpefInputsStore.setState({ byPatientId: {} })
  })

  it('keeps only what was typed, and leaves the rest to the report', () => {
    const inputs = buildHfpefInputs({ septalE: { value: '6', measuredOn: '2026-09-12' } }, FIRST)

    expect(Object.keys(inputs.entries)).toEqual(['septalE'])
    expect(inputs.entries.septalE).toEqual({
      value: '6',
      measuredOn: '2026-09-12',
      modifiedAt: FIRST.toISOString(),
    })
  })

  it('does not re-date a value typed again unchanged', () => {
    const first = buildHfpefInputs({ gls: { value: '14', measuredOn: '2026-09-12' } }, FIRST)
    const again = mergeHfpefInputs(first, { gls: { value: '14', measuredOn: '2026-09-12' } }, LATER)

    expect(again).toBe(first)
    const changed = mergeHfpefInputs(first, { gls: { value: '15', measuredOn: '2026-09-12' } }, LATER)
    expect(changed.entries.gls?.modifiedAt).toBe(LATER.toISOString())
  })

  it('withdraws an emptied field rather than storing a blank', () => {
    const first = buildHfpefInputs({ gls: { value: '14' } }, FIRST)
    expect(mergeHfpefInputs(first, { gls: null }, LATER).entries.gls).toBeUndefined()
    expect(mergeHfpefInputs(first, { gls: { value: '  ' } }, LATER).entries.gls).toBeUndefined()
  })

  it('keeps one patient\'s values out of the next patient\'s chart', () => {
    const store = useHfpefInputsStore.getState()
    store.setInputs('p1', { lavi: { value: '42' } }, FIRST)
    store.hydrate('p2')

    expect(useHfpefInputsStore.getState().byPatientId.p2?.entries).toEqual({})
    expect(localStorage.getItem(hfpefInputsStorageKey('p1'))).toContain('42')
    expect(localStorage.getItem(hfpefInputsStorageKey('p2'))).toBeNull()

    // And are there again at the next visit.
    useHfpefInputsStore.setState({ byPatientId: {} })
    useHfpefInputsStore.getState().hydrate('p1')
    expect(useHfpefInputsStore.getState().byPatientId.p1?.entries.lavi?.value).toBe('42')
  })
})
