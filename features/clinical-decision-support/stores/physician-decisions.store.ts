/**
 * What the physician decided about each recommendation, per patient.
 *
 * A recommendation with no way to answer it is a recommendation that is read
 * once and scrolled past. This store is the answer: one decision per module —
 * prescribed, dose adjusted, contraindicated, deferred, the patient's own
 * preference, or an order placed — with the reasons chosen, a free-text note,
 * and when it was recorded.
 *
 * Three things it deliberately is not:
 *
 * - **Not a fact.** Nothing here re-enters the pack. There is no fact key for
 *   「我開了」 in `@voho0000/personalized-care` 1.13.0, so a decision changes
 *   the step bar and the next step and nothing else. When the pack grows one,
 *   this is the store that feeds it.
 * - **Not a closure.** 「已開立」 does not retire a row. If the rules find the
 *   same gap next visit the row comes back, carrying last visit's decision and
 *   its date, because the record is what decides whether a gap is still open.
 * - **Not a chart entry.** Nothing is written back to the record and nothing
 *   is claimed; the decision is encrypted under this tab's session key and
 *   keyed by patient, so it survives a reload and no one else's browser
 *   session can read it. Carrying it to the next visit is phase 2.
 *
 * `packVersion` travels with each decision so a reader can tell 「這是對哪一版
 * 規則做的決定」 — a row whose wording changed between releases is not
 * necessarily the row that was decided.
 */
import { create } from 'zustand'
import {
  createHydrationGuard,
  discardEncryptedAnswers,
  hasEncryptedAnswers,
  loadEncryptedAnswers,
  persistEncryptedAnswers,
} from '@/src/application/services/encrypted-answer-cache.service'

export type PhysicianDecisionKind =
  | 'prescribed'
  | 'dose-adjusted'
  | 'contraindicated'
  | 'deferred'
  | 'patient-preference'
  | 'ordered'

export interface PhysicianDecision {
  decision: PhysicianDecisionKind
  /** Reason ids from `DECISION_REASONS`; free text goes in `note`. */
  reasons: readonly string[]
  note?: string
  /** When it was recorded, as an ISO timestamp. */
  recordedAt: string
  /** The rules version the decision was made against. */
  packVersion: string
}

export type PhysicianDecisionMap = Readonly<Record<string, PhysicianDecision>>

const STORAGE_PREFIX = 'cdss-physician-decisions:'

/** The key one patient's encrypted decisions are kept under. */
export function physicianDecisionsStorageKey(patientId: string): string {
  return `${STORAGE_PREFIX}${patientId}`
}

const DECISION_KINDS: readonly PhysicianDecisionKind[] = [
  'prescribed',
  'dose-adjusted',
  'contraindicated',
  'deferred',
  'patient-preference',
  'ordered',
]

function isDecisionKind(value: unknown): value is PhysicianDecisionKind {
  return DECISION_KINDS.some((kind) => kind === value)
}

/**
 * Storage is a best-effort cache, never a source of clinical truth: Safari
 * private mode throws on write, a quota can be full, a session that cannot
 * decrypt hands back nothing, and a hand-edited value can be anything at all.
 * Every path therefore degrades to 「還沒決定」.
 */
function toDecisions(parsed: unknown): PhysicianDecisionMap {
  try {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const decisions: Record<string, PhysicianDecision> = {}
    for (const [moduleId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const record = value as Record<string, unknown>
      if (!isDecisionKind(record.decision)) continue
      decisions[moduleId] = {
        decision: record.decision,
        reasons: Array.isArray(record.reasons)
          ? record.reasons.filter((reason): reason is string => typeof reason === 'string')
          : [],
        ...(typeof record.note === 'string' && record.note ? { note: record.note } : {}),
        recordedAt: typeof record.recordedAt === 'string' ? record.recordedAt : '',
        packVersion: typeof record.packVersion === 'string' ? record.packVersion : '',
      }
    }
    return decisions
  } catch {
    return {}
  }
}

function writeStoredDecisions(patientId: string, decisions: PhysicianDecisionMap): void {
  const key = physicianDecisionsStorageKey(patientId)
  if (Object.keys(decisions).length === 0) {
    discardEncryptedAnswers(key)
    return
  }
  persistEncryptedAnswers(key, decisions)
}

const hydration = createHydrationGuard()

/** What a decision is being recorded about, without the clock or the store. */
export interface PhysicianDecisionInput {
  decision: PhysicianDecisionKind
  reasons?: readonly string[]
  note?: string
  packVersion: string
}

const EMPTY_DECISIONS: PhysicianDecisionMap = Object.freeze({})

interface PhysicianDecisionsState {
  byPatientId: Readonly<Record<string, PhysicianDecisionMap>>
  /** Which charts have been read back, so the screen can tell 「沒有決定」 from
   *  「還沒讀到」 rather than showing every row undecided and then jumping. */
  hydratedPatientIds: Readonly<Record<string, true>>
  /** Loads one patient's stored decisions once; a no-op after that. */
  hydrate: (patientId: string) => void
  recordDecision: (
    patientId: string,
    moduleId: string,
    input: PhysicianDecisionInput,
    now?: Date,
  ) => void
  clearDecision: (patientId: string, moduleId: string) => void
  clearDecisions: (patientId: string) => void
}

export const usePhysicianDecisionsStore = create<PhysicianDecisionsState>()((set, get) => ({
  byPatientId: {},
  hydratedPatientIds: {},

  hydrate: (patientId) => {
    if (!patientId) return
    const state = get()
    if (state.hydratedPatientIds[patientId] || hydration.isPending(patientId)) return

    // Decisions already in memory are this session's own, and a chart with no
    // stored record is a first visit. Neither needs a decryption, and neither
    // writes anything.
    if (
      state.byPatientId[patientId]
      || !hasEncryptedAnswers(physicianDecisionsStorageKey(patientId))
    ) {
      set((current) => ({
        byPatientId: current.byPatientId[patientId]
          ? current.byPatientId
          : { ...current.byPatientId, [patientId]: EMPTY_DECISIONS },
        hydratedPatientIds: { ...current.hydratedPatientIds, [patientId]: true },
      }))
      return
    }

    const settle = hydration.begin(patientId)
    const apply = (decisions: PhysicianDecisionMap) => {
      if (!settle()) return
      set((current) => ({
        // A decision recorded while the read was in flight is more recent than
        // storage; it stands.
        byPatientId: current.byPatientId[patientId]
          ? current.byPatientId
          : { ...current.byPatientId, [patientId]: decisions },
        hydratedPatientIds: { ...current.hydratedPatientIds, [patientId]: true },
      }))
    }
    void loadEncryptedAnswers<unknown>(physicianDecisionsStorageKey(patientId))
      .then((stored) => apply(toDecisions(stored)))
      // A record that cannot be read leaves every row undecided, which is the
      // same state as a chart nobody has decided on.
      .catch(() => apply(EMPTY_DECISIONS))
  },

  recordDecision: (patientId, moduleId, input, now = new Date()) => {
    if (!patientId || !moduleId) return
    set((state) => {
      const current = state.byPatientId[patientId] ?? EMPTY_DECISIONS
      const next: PhysicianDecisionMap = {
        ...current,
        [moduleId]: {
          decision: input.decision,
          reasons: [...(input.reasons ?? [])],
          ...(input.note?.trim() ? { note: input.note.trim() } : {}),
          recordedAt: now.toISOString(),
          packVersion: input.packVersion,
        },
      }
      // In memory first; the encryption runs in the background and cannot
      // reach back into what the screen is already showing.
      writeStoredDecisions(patientId, next)
      return { byPatientId: { ...state.byPatientId, [patientId]: next } }
    })
  },

  clearDecision: (patientId, moduleId) => {
    if (!patientId || !moduleId) return
    set((state) => {
      const current = state.byPatientId[patientId] ?? EMPTY_DECISIONS
      if (!(moduleId in current)) return state
      const next = { ...current }
      delete next[moduleId]
      writeStoredDecisions(patientId, next)
      return { byPatientId: { ...state.byPatientId, [patientId]: next } }
    })
  },

  clearDecisions: (patientId) => {
    if (!patientId) return
    discardEncryptedAnswers(physicianDecisionsStorageKey(patientId))
    set((state) => ({
      byPatientId: { ...state.byPatientId, [patientId]: EMPTY_DECISIONS },
      hydratedPatientIds: { ...state.hydratedPatientIds, [patientId]: true },
    }))
  },
}))

/**
 * One patient's decisions, referentially stable between changes, so the flow
 * model is not rebuilt on every unrelated render.
 */
export function usePhysicianDecisions(patientId: string | undefined): PhysicianDecisionMap {
  return usePhysicianDecisionsStore(
    (state) => (patientId ? state.byPatientId[patientId] : undefined) ?? EMPTY_DECISIONS,
  )
}

/** Whether this chart's decisions have been read back yet. */
export function usePhysicianDecisionsHydrated(patientId: string | undefined): boolean {
  return usePhysicianDecisionsStore(
    (state) => !patientId || Boolean(state.hydratedPatientIds[patientId]),
  )
}

/** Reads one patient's decisions outside React (tests, imperative callers). The
 *  stored copy is encrypted, so only what this session has read back is here. */
export function getPhysicianDecisions(patientId: string): PhysicianDecisionMap {
  return usePhysicianDecisionsStore.getState().byPatientId[patientId] ?? EMPTY_DECISIONS
}
