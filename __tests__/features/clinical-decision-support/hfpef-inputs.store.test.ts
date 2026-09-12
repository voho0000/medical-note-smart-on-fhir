/**
 * The echo values a clinician typed: kept per patient, dated by the change, and
 * sealed — a measured LAVI or E/e′ against a named patient is a finding, and it
 * used to sit in `localStorage` in plain text for whoever opened the browser
 * next.
 */
import {
  buildHfpefInputs,
  hfpefInputsStorageKey,
  mergeHfpefInputs,
  useHfpefInputsStore,
} from '@/features/clinical-decision-support/stores/hfpef-inputs.store'
import {
  expectSealedEnvelope,
  storedCiphertext,
  until,
  useRealWebCrypto,
} from './encrypted-answers.helper'

const FIRST = new Date('2026-09-12T14:09:00+08:00')
const LATER = new Date('2026-09-12T14:30:00+08:00')

function hydrated(patientId: string): boolean {
  return Boolean(useHfpefInputsStore.getState().hydratedPatientIds[patientId])
}

describe('the typed HFpEF inputs', () => {
  useRealWebCrypto()

  beforeEach(() => {
    localStorage.clear()
    useHfpefInputsStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
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

  it('keeps one patient\'s values out of the next patient\'s chart', async () => {
    const store = useHfpefInputsStore.getState()
    store.setInputs('p1', { lavi: { value: '42', measuredOn: '2026-09-12' } }, FIRST)
    const raw = await storedCiphertext(hfpefInputsStorageKey('p1'))

    store.hydrate('p2')
    await until(() => hydrated('p2'), 'p2 to hydrate')
    expect(useHfpefInputsStore.getState().byPatientId.p2?.entries).toEqual({})
    expect(localStorage.getItem(hfpefInputsStorageKey('p2'))).toBeNull()

    // The number the clinician read off the report is not in there in the clear.
    expectSealedEnvelope(raw, ['lavi', 'entries', 'measuredOn', '2026-09-12'])

    // And it is there again after a reload of this tab.
    useHfpefInputsStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
    useHfpefInputsStore.getState().hydrate('p1')
    await until(() => hydrated('p1'), 'p1 to hydrate')
    expect(useHfpefInputsStore.getState().byPatientId.p1?.entries.lavi?.value).toBe('42')
  })

  it('writes nothing while the read is still in flight', async () => {
    useHfpefInputsStore.getState().setInputs('p1', { lavi: { value: '42' } }, FIRST)
    const sealed = await storedCiphertext(hfpefInputsStorageKey('p1'))
    useHfpefInputsStore.setState({ byPatientId: {}, hydratedPatientIds: {} })

    useHfpefInputsStore.getState().hydrate('p1')
    expect(hydrated('p1')).toBe(false)
    expect(localStorage.getItem(hfpefInputsStorageKey('p1'))).toBe(sealed)

    await until(() => hydrated('p1'), 'p1 to hydrate')
    expect(localStorage.getItem(hfpefInputsStorageKey('p1'))).toBe(sealed)
  })

  it('drops a read that resolves after the chart has moved on', async () => {
    const store = useHfpefInputsStore.getState()
    store.setInputs('p1', { lavi: { value: '42' } }, FIRST)
    store.setInputs('p2', { lavi: { value: '28' } }, FIRST)
    await storedCiphertext(hfpefInputsStorageKey('p1'))
    await storedCiphertext(hfpefInputsStorageKey('p2'))
    useHfpefInputsStore.setState({ byPatientId: {}, hydratedPatientIds: {} })

    store.hydrate('p1')
    store.hydrate('p2')
    await until(() => hydrated('p2'), 'p2 to hydrate')

    expect(useHfpefInputsStore.getState().byPatientId.p1).toBeUndefined()
    expect(hydrated('p1')).toBe(false)
    expect(useHfpefInputsStore.getState().byPatientId.p2?.entries.lavi?.value).toBe('28')
  })

  it('leaves a chart nobody has typed into unwritten, and open in the same tick', () => {
    useHfpefInputsStore.getState().hydrate('first-visit')

    expect(hydrated('first-visit')).toBe(true)
    expect(localStorage.getItem(hfpefInputsStorageKey('first-visit'))).toBeNull()
  })
})
