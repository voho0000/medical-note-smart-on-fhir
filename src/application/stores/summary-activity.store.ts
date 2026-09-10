// Whether an AI summary run has finished while nobody could see it.
//
// The feature panel can be collapsed (「專注總覽」), which hides the only place
// a finished summary announces itself. This store carries just enough for the
// collapsed rail to say so: a monotonic timestamp of the last completion, and
// whether a run is in flight. Session-only, never persisted, and it holds NO
// summary content — only the fact that one finished.
//
// It deliberately does NOT make anything run: `autoGenerate` stays false by
// default, so this stays silent until the clinician turns auto-generate on or
// presses 產生摘要 themselves.
import { create } from 'zustand'

interface SummaryActivityStore {
  isGenerating: boolean
  /** Date.now() when the current run began, so a collapsed rail can say how
   *  long it has been waiting. Cleared when the run ends. */
  startedAt: number | null
  /** Date.now() of the last completed run, or null if none this session. */
  completedAt: number | null
  /** Set while the feature panel is hidden, so the rail knows what is new. */
  acknowledgedAt: number | null
  setGenerating: (value: boolean) => void
  markCompleted: () => void
  acknowledge: () => void
}

export const useSummaryActivityStore = create<SummaryActivityStore>((set) => ({
  isGenerating: false,
  startedAt: null,
  completedAt: null,
  acknowledgedAt: null,
  setGenerating: (value) => set((state) => (
    state.isGenerating === value
      ? state
      // Keep the original start across the re-renders of a single run; only a
      // transition into `true` begins the clock.
      : { isGenerating: value, startedAt: value ? Date.now() : null }
  )),
  markCompleted: () => set({ isGenerating: false, startedAt: null, completedAt: Date.now() }),
  acknowledge: () => set({ acknowledgedAt: Date.now() }),
}))

/** True when a run finished that the reader has not yet been shown. */
export function hasUnseenSummary(state: {
  completedAt: number | null
  acknowledgedAt: number | null
}): boolean {
  if (state.completedAt === null) return false
  return state.acknowledgedAt === null || state.completedAt > state.acknowledgedAt
}
