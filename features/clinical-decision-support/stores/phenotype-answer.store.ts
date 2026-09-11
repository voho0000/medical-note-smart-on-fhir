/**
 * What the physician answered on the DP-01 phenotype gate, per patient.
 *
 * 健保雲端 holds no ejection fraction for a patient whose only echocardiogram
 * was done at another hospital, on paper, or in a nuclear medicine department,
 * and both ESC 2026 phenotypes start from one. The 01 card therefore asks, and
 * the answer is handed back to the pack as facts (see `applyPhenotypeAnswer`)
 * so every module that reads an LVEF recomputes from it — nothing patches a
 * rendered card. The same store carries the physician's confirmation of the
 * HFpEF diagnosis on the DP-01b card.
 *
 * Session-only, on purpose: an entered LVEF is patient data with no approved
 * persistence path, so it lives in memory for this tab and is gone on reload.
 * Keyed by patient so an answer never follows the previous patient into the
 * next chart. The seam for a later persisted implementation is
 * `PhenotypeAnswerRepository` — swap the repository, and nothing above it
 * changes.
 */
import { create } from 'zustand'

/** The three choices the pack offers, by the option ids it publishes. */
export type PhenotypeAnswerChoice = 'reduced' | 'preserved' | 'unknown'

/** The DP-00 answer: whether this clinician is asking about heart failure. */
export type HeartFailureSuspicionAnswer = 'suspected' | 'not-suspected'

export interface PhenotypeAnswer {
  /**
   * DP-00. Absent means nobody has been asked yet, which the pack never reads
   * as 「不懷疑」 — it is the difference between a quiet card and a closed one.
   */
  hfSuspicion?: HeartFailureSuspicionAnswer
  /**
   * Absent where the phenotype gate never asked — a patient whose record does
   * hold an LVEF can still reach the HFpEF confirmation below.
   */
  choice?: PhenotypeAnswerChoice
  /** The LVEF the physician read off the outside report, where they gave one. */
  lvef?: number
  /** The date of that study, as YYYY-MM-DD. */
  measuredOn?: string
  /** The day the answer was given, as YYYY-MM-DD. */
  answeredOn: string
  /** Set once the physician works through §5.2.2 and confirms HFpEF. */
  hfpEfConfirmed?: boolean
}

/**
 * Where a patient's answer is kept.
 *
 * Async on purpose. The session implementation below resolves immediately, but
 * the approved persisted path is a per-UID Firestore document, and an
 * interface that could only be synchronous would have to be rewritten — along
 * with every caller — the day it lands. Callers await `load` once per patient
 * and read the cached value from the store afterwards.
 */
export interface PhenotypeAnswerRepository {
  load: (patientId: string) => Promise<PhenotypeAnswer | undefined>
  save: (patientId: string, answer: PhenotypeAnswer) => Promise<void>
  clear: (patientId: string) => Promise<void>
}

/**
 * The default: this tab's memory and nothing else.
 *
 * Deliberately not `localStorage`. An LVEF and a study date the physician typed
 * are patient data, and the evidence switches next door persist only because a
 * boolean about a row is not.
 */
export function createSessionPhenotypeAnswerRepository(): PhenotypeAnswerRepository {
  const answers = new Map<string, PhenotypeAnswer>()
  return {
    load: async (patientId) => answers.get(patientId),
    save: async (patientId, answer) => {
      answers.set(patientId, answer)
    },
    clear: async (patientId) => {
      answers.delete(patientId)
    },
  }
}

let repository: PhenotypeAnswerRepository = createSessionPhenotypeAnswerRepository()

/**
 * Replaces the repository, for a persisted implementation or for a test.
 *
 * Anything already cached in the store is dropped: a new repository is a new
 * answer to 「這位病人上次填了什麼」, and keeping the old cache would show one
 * store's answer over another's.
 */
export function setPhenotypeAnswerRepository(next: PhenotypeAnswerRepository): void {
  repository = next
  usePhenotypeAnswerStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
}

interface PhenotypeAnswerState {
  byPatientId: Readonly<Record<string, PhenotypeAnswer>>
  /** Which patients the repository has already been asked about. */
  hydratedPatientIds: Readonly<Record<string, true>>
  /** Reads one patient's stored answer once; a no-op after that. */
  hydrate: (patientId: string) => void
  setAnswer: (patientId: string, answer: PhenotypeAnswer) => void
  clearAnswer: (patientId: string) => void
}

export const usePhenotypeAnswerStore = create<PhenotypeAnswerState>()((set, get) => ({
  byPatientId: {},
  hydratedPatientIds: {},

  hydrate: (patientId) => {
    if (!patientId || get().hydratedPatientIds[patientId]) return
    set((state) => ({
      hydratedPatientIds: { ...state.hydratedPatientIds, [patientId]: true },
    }))
    void repository.load(patientId).then((answer) => {
      if (!answer) return
      set((state) => (
        // A physician who answered while the read was in flight has said
        // something more recent than storage; their answer stands.
        state.byPatientId[patientId]
          ? state
          : { byPatientId: { ...state.byPatientId, [patientId]: answer } }
      ))
    }).catch(() => {
      // A store that cannot be read leaves the card asking, which is the same
      // state as a patient who has never been answered for.
    })
  },

  setAnswer: (patientId, answer) => {
    if (!patientId) return
    set((state) => ({ byPatientId: { ...state.byPatientId, [patientId]: answer } }))
    void repository.save(patientId, answer).catch(() => {
      // The answer holds for this session even where it could not be written.
    })
  },

  clearAnswer: (patientId) => {
    if (!patientId) return
    set((state) => {
      if (!(patientId in state.byPatientId)) return state
      const next = { ...state.byPatientId }
      delete next[patientId]
      return { byPatientId: next }
    })
    void repository.clear(patientId).catch(() => {})
  },
}))

/** One patient's answer, or undefined while the card is still asking. */
export function usePhenotypeAnswer(patientId: string | undefined): PhenotypeAnswer | undefined {
  return usePhenotypeAnswerStore(
    (state) => (patientId ? state.byPatientId[patientId] : undefined),
  )
}
