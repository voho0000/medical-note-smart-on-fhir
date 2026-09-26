/**
 * Local-only timing for the 20-second decision target.
 *
 * Measures, in this browser tab only, the time from the moment 「今天要決定」
 * first became visible for a patient to each decision the clinician records.
 * Nothing is stored, persisted or sent anywhere: the entries live on `window`
 * for the length of the page so a usability test (or the browser console) can
 * read them, and they vanish on reload. No patient identifier is kept — only
 * the module id and the elapsed milliseconds.
 */
export interface CdssDecisionTiming {
  moduleId: string
  /** Milliseconds from the focus list first rendering to the decision. */
  elapsedMs: number
  /** How many decisions had already been recorded since the list rendered. */
  order: number
}

type TimingWindow = Window & { __mediprismaCdssTimings?: CdssDecisionTiming[] }

let shownAt: number | undefined
let recorded = 0

function clock(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

/** Starts the clock for a newly shown patient; later calls for the same patient are ignored. */
export function markCdssFocusShown(reset = false): void {
  if (shownAt !== undefined && !reset) return
  shownAt = clock()
  recorded = 0
}

/** Records one decision's elapsed time; returns it so callers and tests can read it. */
export function recordCdssDecisionTiming(moduleId: string): CdssDecisionTiming | undefined {
  if (shownAt === undefined) return undefined
  recorded += 1
  const entry: CdssDecisionTiming = { moduleId, elapsedMs: Math.round(clock() - shownAt), order: recorded }
  if (typeof window !== 'undefined') {
    const target = window as TimingWindow
    target.__mediprismaCdssTimings = [...(target.__mediprismaCdssTimings ?? []), entry].slice(-50)
  }
  return entry
}

/** Test hook: forget the current clock. */
export function resetCdssDecisionTiming(): void {
  shownAt = undefined
  recorded = 0
}
