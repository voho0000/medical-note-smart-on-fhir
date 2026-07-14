// Resource navigation — the "second evidence layer" link: clicking a cited
// source (or timeline event) in the Medical Summary tab switches the LEFT
// panel to the tab that owns that resource type and scroll-flashes the exact
// card via useResourceAnchor. Session-only state, never persisted.
//
// Flow: navigate(target) → LeftPanelLayout switches its tab (and page.tsx
// flips the mobile 臨床摘要/功能 split) → the matching anchor mounts/notices,
// scrolls itself into view and calls consume(). If nothing consumes within
// NAV_CLAIM_TIMEOUT_MS the caller may show a fallback toast — switching to
// the right tab always succeeds; pinpoint scrolling is best-effort.
import { create } from 'zustand'

export interface ResourceNavTarget {
  resourceType: string
  resourceId: string
  /** For the fallback toast ("2026-06-02 胸腔檢查"). */
  display?: string
  date?: string
}

/** resourceType → left-panel tab id (feature-registry ids). */
export function leftTabForResourceType(resourceType: string): string | null {
  switch (resourceType) {
    case 'Encounter':
      return 'visits'
    case 'DiagnosticReport':
    case 'ImagingStudy':
    case 'Observation':
      return 'reports'
    case 'MedicationRequest':
    case 'MedicationStatement':
      return 'meds'
    case 'Condition':
      return 'patient'
    // Care plans render in the 病人資訊 tab (CarePlansCard).
    case 'CarePlan':
      return 'patient'
    case 'DocumentReference':
    case 'Composition':
      return 'documents'
    // Procedures render inside visit details — land on the visits tab.
    case 'Procedure':
      return 'visits'
    default:
      return null
  }
}

// Raw reports are mounted through a virtualized list. Allow that pipeline to
// finish before telling the user pinpoint navigation failed; 800ms was short
// enough to race normal first-open rendering.
export const NAV_CLAIM_TIMEOUT_MS = 2500

interface ResourceNavigationStore {
  pending: ResourceNavTarget | null
  /** Monotonic nonce so re-navigating to the SAME target re-triggers effects. */
  seq: number
  navigate: (target: ResourceNavTarget) => void
  consume: () => void
}

export const useResourceNavigationStore = create<ResourceNavigationStore>((set) => ({
  pending: null,
  seq: 0,
  navigate: (target) => set((s) => ({ pending: target, seq: s.seq + 1 })),
  consume: () => set({ pending: null }),
}))
