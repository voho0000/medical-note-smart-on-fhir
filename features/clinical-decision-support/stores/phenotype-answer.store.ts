/**
 * What the physician answered on the DP-00/DP-01 phenotype gate, per patient.
 *
 * 健保雲端 holds no ejection fraction for a patient whose only echocardiogram
 * was done at another hospital, on paper, or in a nuclear medicine department,
 * and both ESC 2026 phenotypes start from one. The 01 card therefore asks, and
 * the answer is handed back to the pack as facts (see `applyPhenotypeAnswer`)
 * so every module that reads an LVEF recomputes from it — nothing patches a
 * rendered card. The same store carries the DP-00 suspicion and the
 * physician's confirmation of the HFpEF diagnosis on the DP-01b card.
 *
 * Each of the three answers carries its own `modifiedAt`, because they are
 * given at different visits and a screen that dates them alike makes a
 * carried-over answer look like today's. Storing an answer unchanged leaves
 * its stamp alone, so 「最後修改」 dates the change rather than the click.
 *
 * Kept per patient in this browser's `localStorage`, so last visit's answers
 * are there at the next one and an answer never follows the previous patient
 * into the next chart. The seam for a server-side implementation is
 * `PhenotypeAnswerRepository` — swap the repository, and nothing above it
 * changes.
 */
import { create } from 'zustand'

/** The three choices the pack offers, by the option ids it publishes. */
export type PhenotypeAnswerChoice = 'reduced' | 'preserved' | 'unknown'

/** 「暫不確認」: the question was put, and the answer is deliberately none. */
export const HFPEF_NOT_CONFIRMED = 'not-assessed' as const

/** The DP-00 answer: whether this clinician is asking about heart failure. */
export type HeartFailureSuspicionAnswer = 'suspected' | 'not-suspected'

/** When each answer was last changed, as ISO timestamps. */
export interface PhenotypeAnswerTimestamps {
  hfSuspicion?: string
  /** The choice, the LVEF and its study date are one answer with one stamp. */
  phenotype?: string
  hfpEfConfirmed?: string
}

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
  /**
   * Set once the physician works through §5.2.2: `true` confirms HFpEF,
   * `'not-assessed'` is 「暫不確認」 — the question was put and deliberately
   * left open. Both count as answered on screen; only `true` produces a fact,
   * because 「今天先不確認」 is not a statement that the patient has no HFpEF.
   */
  hfpEfConfirmed?: boolean | typeof HFPEF_NOT_CONFIRMED
  /** Per-answer last-modified stamps, kept by the store rather than callers. */
  modifiedAt?: PhenotypeAnswerTimestamps
}

/**
 * The stamps after one save.
 *
 * Each group keeps its stamp while its own value is unchanged, so answering
 * the HFpEF confirmation today does not re-date a suspicion answered in
 * August. Exported because the diff, not the click, is what 「最後修改」 means.
 */
export function stampPhenotypeAnswer(
  previous: PhenotypeAnswer | undefined,
  next: PhenotypeAnswer,
  now: Date = new Date(),
): PhenotypeAnswer {
  const at = now.toISOString()
  const before = previous?.modifiedAt ?? {}
  const modifiedAt: PhenotypeAnswerTimestamps = {}

  const suspicionChanged = previous?.hfSuspicion !== next.hfSuspicion
  if (next.hfSuspicion !== undefined) {
    modifiedAt.hfSuspicion = suspicionChanged ? at : before.hfSuspicion ?? at
  }

  const phenotypeChanged = previous?.choice !== next.choice
    || previous?.lvef !== next.lvef
    || previous?.measuredOn !== next.measuredOn
  if (next.choice !== undefined) {
    modifiedAt.phenotype = phenotypeChanged ? at : before.phenotype ?? at
  }

  const confirmationChanged = previous?.hfpEfConfirmed !== next.hfpEfConfirmed
  if (next.hfpEfConfirmed !== undefined) {
    modifiedAt.hfpEfConfirmed = confirmationChanged ? at : before.hfpEfConfirmed ?? at
  }

  return { ...next, modifiedAt }
}

/** Whether two answers state the same thing, stamps aside. */
function sameAnswer(a: PhenotypeAnswer | undefined, b: PhenotypeAnswer): boolean {
  return Boolean(a)
    && a?.hfSuspicion === b.hfSuspicion
    && a?.choice === b.choice
    && a?.lvef === b.lvef
    && a?.measuredOn === b.measuredOn
    && a?.hfpEfConfirmed === b.hfpEfConfirmed
}

/**
 * Where a patient's answer is kept.
 *
 * Async on purpose. The browser implementation below resolves immediately, but
 * a per-UID Firestore document is the approved server-side path, and an
 * interface that could only be synchronous would have to be rewritten — along
 * with every caller — the day it lands. Callers await `load` once per patient
 * and read the cached value from the store afterwards.
 */
export interface PhenotypeAnswerRepository {
  load: (patientId: string) => Promise<PhenotypeAnswer | undefined>
  save: (patientId: string, answer: PhenotypeAnswer) => Promise<void>
  clear: (patientId: string) => Promise<void>
}

const STORAGE_PREFIX = 'cdss-phenotype-answer:'

/** The localStorage key one patient's answer is kept under. */
export function phenotypeAnswerStorageKey(patientId: string): string {
  return `${STORAGE_PREFIX}${patientId}`
}

function isSuspicion(value: unknown): value is HeartFailureSuspicionAnswer {
  return value === 'suspected' || value === 'not-suspected'
}

function isChoice(value: unknown): value is PhenotypeAnswerChoice {
  return value === 'reduced' || value === 'preserved' || value === 'unknown'
}

function parseStoredAnswer(raw: string | null): PhenotypeAnswer | undefined {
  if (!raw) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    const record = parsed as Record<string, unknown>
    const stamps = (record.modifiedAt ?? {}) as Record<string, unknown>
    const stamp = (key: string) => (typeof stamps[key] === 'string' ? { [key]: stamps[key] } : {})
    return {
      answeredOn: typeof record.answeredOn === 'string' ? record.answeredOn : '',
      ...(isSuspicion(record.hfSuspicion) ? { hfSuspicion: record.hfSuspicion } : {}),
      ...(isChoice(record.choice) ? { choice: record.choice } : {}),
      ...(typeof record.lvef === 'number' && Number.isFinite(record.lvef) ? { lvef: record.lvef } : {}),
      ...(typeof record.measuredOn === 'string' ? { measuredOn: record.measuredOn } : {}),
      ...(typeof record.hfpEfConfirmed === 'boolean' || record.hfpEfConfirmed === HFPEF_NOT_CONFIRMED
        ? { hfpEfConfirmed: record.hfpEfConfirmed as boolean | typeof HFPEF_NOT_CONFIRMED }
        : {}),
      modifiedAt: {
        ...stamp('hfSuspicion'),
        ...stamp('phenotype'),
        ...stamp('hfpEfConfirmed'),
      },
    }
  } catch {
    return undefined
  }
}

/**
 * The default: this browser, keyed by patient.
 *
 * Nothing is written to the chart and nothing leaves the machine. What is kept
 * is what the clinician said about this patient — the same standing as the
 * evidence switches next door, which persist for the same reason: a judgement
 * re-entered at every visit is a judgement nobody makes twice.
 */
export function createLocalStoragePhenotypeAnswerRepository(): PhenotypeAnswerRepository {
  const available = () => typeof window !== 'undefined'
  return {
    load: async (patientId) => {
      if (!available() || !patientId) return undefined
      try {
        return parseStoredAnswer(window.localStorage.getItem(phenotypeAnswerStorageKey(patientId)))
      } catch {
        return undefined
      }
    },
    save: async (patientId, answer) => {
      if (!available() || !patientId) return
      try {
        window.localStorage.setItem(phenotypeAnswerStorageKey(patientId), JSON.stringify(answer))
      } catch {
        // An answer that cannot be persisted still holds for this session.
      }
    },
    clear: async (patientId) => {
      if (!available() || !patientId) return
      try {
        window.localStorage.removeItem(phenotypeAnswerStorageKey(patientId))
      } catch {
        // Nothing to do: the in-memory copy is cleared by the caller.
      }
    },
  }
}

/** This tab's memory and nothing else, for a test that wants no storage. */
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

let repository: PhenotypeAnswerRepository = createLocalStoragePhenotypeAnswerRepository()

/**
 * Replaces the repository, for a server-side implementation or for a test.
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
  setAnswer: (patientId: string, answer: PhenotypeAnswer, now?: Date) => void
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

  setAnswer: (patientId, answer, now = new Date()) => {
    if (!patientId) return
    const previous = get().byPatientId[patientId]
    // Saving the same answer again is not a new answer. The stamps are carried
    // forward so a re-render, a hydration or a second click cannot re-date what
    // the clinician said last month.
    if (sameAnswer(previous, answer) && previous?.answeredOn === answer.answeredOn) return
    const stamped = stampPhenotypeAnswer(previous, answer, now)
    set((state) => ({ byPatientId: { ...state.byPatientId, [patientId]: stamped } }))
    void repository.save(patientId, stamped).catch(() => {
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
