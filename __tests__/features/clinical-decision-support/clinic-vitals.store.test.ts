/**
 * A value the physician entered on this chart has to be there after a reload,
 * and has to be nowhere near the next patient's chart. Everything else this
 * store does — a dialog that owns every value at once, a chip strip that owns
 * none of them — is checked here rather than through the page.
 */
import {
  clinicVitalsStorageKey,
  getClinicVitals,
  useClinicVitalsStore,
} from '@/features/clinical-decision-support/stores/clinic-vitals.store'

function reset() {
  useClinicVitalsStore.setState({ byPatientId: {} })
  window.localStorage.clear()
}

describe('the clinic vitals store', () => {
  beforeEach(reset)

  it('keeps one entry per patient and reads it back after a re-init', () => {
    useClinicVitalsStore.getState().recordValues('patient-a', {
      entries: { LVEF: { value: 35 } }, measuredOn: '2026-09-09',
    })

    expect(getClinicVitals('patient-a')?.entries?.LVEF)
      .toEqual({ value: 35, enteredAt: '2026-09-09' })

    // A fresh store — a reload — reads the same value back out of storage.
    useClinicVitalsStore.setState({ byPatientId: {} })
    useClinicVitalsStore.getState().hydrate('patient-a')
    expect(useClinicVitalsStore.getState().byPatientId['patient-a']?.entries?.LVEF)
      .toEqual({ value: 35, enteredAt: '2026-09-09' })

    // And never follows the clinician into the next chart.
    useClinicVitalsStore.getState().hydrate('patient-b')
    expect(useClinicVitalsStore.getState().byPatientId['patient-b']).toBeUndefined()
  })

  it('clears one value without touching the others, and forgets the patient when the last goes', () => {
    const store = useClinicVitalsStore.getState()
    store.recordValues('patient-a', {
      entries: { LVEF: { value: 35 }, potassium: { value: 5.1 } },
      measuredOn: '2026-09-09',
    })

    store.clearEntry('patient-a', 'LVEF')
    expect(getClinicVitals('patient-a')?.entries).toEqual({
      potassium: { value: 5.1, enteredAt: '2026-09-09' },
    })

    store.clearEntry('patient-a', 'potassium')
    expect(useClinicVitalsStore.getState().byPatientId['patient-a']).toBeUndefined()
    expect(window.localStorage.getItem(clinicVitalsStorageKey('patient-a'))).toBeNull()
  })

  it('lets one save own every value, and leaves the chips it does not hold alone', () => {
    const store = useClinicVitalsStore.getState()
    store.recordSymptoms('patient-a', { symptoms: ['dyspnea'], measuredOn: '2026-09-09' })
    store.recordValues('patient-a', {
      entries: {
        bloodPressure: { value: 148, diastolic: 82 },
        heartRate: { value: 78 },
        LVEF: { value: 35 },
      },
      rhythm: 'sinus',
      measuredOn: '2026-09-09',
    })

    expect(getClinicVitals('patient-a')?.entries?.bloodPressure)
      .toEqual({ value: 148, diastolic: 82, enteredAt: '2026-09-09' })
    // A save made in the dialog never touches what the chip strip wrote.
    expect(getClinicVitals('patient-a')?.symptoms).toEqual(['dyspnea'])

    // The dialog owns every value, so a box left empty puts that one back on
    // the record — and a value that did not change keeps the day it was entered.
    store.recordValues('patient-a', {
      entries: { LVEF: { value: 35 } }, measuredOn: '2026-09-10',
    })
    const vitals = getClinicVitals('patient-a')
    expect(vitals?.entries?.bloodPressure).toBeUndefined()
    expect(vitals?.entries?.heartRate).toBeUndefined()
    expect(vitals?.entries?.LVEF).toEqual({ value: 35, enteredAt: '2026-09-09' })
    expect(vitals?.rhythm).toBeUndefined()
    expect(vitals?.symptoms).toEqual(['dyspnea'])
  })

  it('takes 「全部撤銷」 as a save with nothing in it', () => {
    const store = useClinicVitalsStore.getState()
    store.recordValues('patient-a', {
      entries: { LVEF: { value: 35 }, potassium: { value: 5.4 } },
      rhythm: 'atrial-fibrillation',
      measuredOn: '2026-09-09',
    })

    store.recordValues('patient-a', { entries: {}, measuredOn: '2026-09-09' })
    expect(useClinicVitalsStore.getState().byPatientId['patient-a']).toBeUndefined()
    expect(window.localStorage.getItem(clinicVitalsStorageKey('patient-a'))).toBeNull()
  })

  it('ignores stored rubbish rather than showing a number nobody entered', () => {
    window.localStorage.setItem(clinicVitalsStorageKey('patient-a'), 'not json')
    useClinicVitalsStore.getState().hydrate('patient-a')
    expect(useClinicVitalsStore.getState().byPatientId['patient-a']).toBeUndefined()

    window.localStorage.setItem(
      clinicVitalsStorageKey('patient-b'),
      JSON.stringify({
        measuredOn: '2026-09-09',
        entries: {
          LVEF: { value: 'thirty-five', enteredAt: '2026-09-09' },
          notAMetric: { value: 3, enteredAt: '2026-09-09' },
          potassium: { value: 5.1, enteredAt: '2026-09-09' },
        },
      }),
    )
    useClinicVitalsStore.getState().hydrate('patient-b')
    expect(useClinicVitalsStore.getState().byPatientId['patient-b']?.entries).toEqual({
      potassium: { value: 5.1, enteredAt: '2026-09-09' },
    })
  })
})
