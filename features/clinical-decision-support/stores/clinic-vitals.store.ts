/**
 * Vital signs measured in the room today, per patient.
 *
 * A clinic's blood pressure cuff, pulse and scale are often not synced to the
 * record the pack reads, so the freshest numbers a titration decision needs
 * are the ones the clinician has just written on paper. They are entered here
 * and handed to the pack as facts (see `applyClinicVitals`), so every module
 * that reads blood pressure, heart rate or weight recomputes from them —
 * nothing patches a rendered card.
 *
 * Session-only, on purpose: an entered vital is patient data with no approved
 * persistence path, so it lives in memory for this tab and is gone on reload.
 * Keyed by patient so a value never follows the previous patient into the
 * next chart.
 */
import { create } from 'zustand'

/**
 * The one-tap answer to 「今天有鬱血徵象嗎？」. The default is no answer —
 * the screen stays quiet and the pack assumes nothing — so only a sign the
 * physician actually saw is ever written. Each option names the signs it
 * stands for in the congestion evidence table.
 */
export type CongestionSignsAnswer = 'edema' | 'orthopnea-pnd' | 'jvp-rales'

export interface ClinicVitals {
  systolic?: number
  diastolic?: number
  heartRate?: number
  bodyWeight?: number
  /** Signs seen in the room this visit; absent means unanswered, never "none". */
  congestionSigns?: readonly CongestionSignsAnswer[]
  /**
   * One answer per sign, keyed by the canonical term the evidence table's rows
   * are matched on: 「有」, 「無」, or absent for 「未評估」.
   *
   * The three-group tap above is the quick answer for the board; this is the
   * row-by-row one from the evidence table, and it wins for a term both name —
   * a physician who says 「orthopnea：無」 on the row has answered more
   * precisely than a group tap that did not mention it.
   */
  signAnswers?: Readonly<Record<string, 'present' | 'absent'>>
  /** The day the measurements were taken, as YYYY-MM-DD. */
  measuredOn: string
}

interface ClinicVitalsState {
  byPatientId: Readonly<Record<string, ClinicVitals>>
  setVitals: (patientId: string, vitals: ClinicVitals) => void
  clearVitals: (patientId: string) => void
}

export const useClinicVitalsStore = create<ClinicVitalsState>()((set) => ({
  byPatientId: {},
  setVitals: (patientId, vitals) => set((state) => ({
    byPatientId: { ...state.byPatientId, [patientId]: vitals },
  })),
  clearVitals: (patientId) => set((state) => {
    if (!(patientId in state.byPatientId)) return state
    const next = { ...state.byPatientId }
    delete next[patientId]
    return { byPatientId: next }
  }),
}))

export function useClinicVitals(patientId: string | undefined): ClinicVitals | undefined {
  return useClinicVitalsStore((state) => (patientId ? state.byPatientId[patientId] : undefined))
}

/** Today's date in the browser's local calendar, as YYYY-MM-DD. */
export function todayIsoDate(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}
