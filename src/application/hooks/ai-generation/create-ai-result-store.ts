// Shared zustand result-store factory for the structured AI pipelines
// (medical summary, safety alerts, report interpretation). Each feature keeps
// its OWN module-level store instance — results/loading/errors keyed by a
// feature-specific slot key — and every store is wiped when a new bundle is
// imported so nothing stale renders against fresh clinical data.
import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { resetOnBundleChange } from '@/src/shared/utils/reset-on-bundle-change'

export interface AiResultStoreState<T> {
  // Keyed by the feature's slot key (e.g. patientId::audience::model for the
  // patient-scoped pipelines, mode::audience::locale::contentSig for report
  // interpretation), so each slot keeps its OWN result / loading / error.
  // Switching slot (model, audience…) just changes which slot the view reads;
  // an in-flight generation keeps running and lands in its own slot (user
  // directive 2026-07-07: don't abort on switch).
  byKey: Record<string, T>
  running: Record<string, boolean>
  errors: Record<string, string | null>
  // Per-key persisted-cache-checked flags. Only used by stores whose hooks
  // hydrate per key (report interpretation); the patient-scoped hooks track
  // hydration as React state keyed to the CURRENT slot instead.
  hydrated: Record<string, boolean>
  setResult: (key: string, result: T) => void
  clear: (key: string) => void
  setRunning: (key: string, value: boolean) => void
  setError: (key: string, error: string | null) => void
  setHydrated: (key: string, value: boolean) => void
}

export type AiResultStore<T> = UseBoundStore<StoreApi<AiResultStoreState<T>>>

/** Create a module-level AI result store wired to reset on bundle change. */
export function createAiResultStore<T>(): AiResultStore<T> {
  const store = create<AiResultStoreState<T>>((set) => ({
    byKey: {},
    running: {},
    errors: {},
    hydrated: {},
    setResult: (key, result) => set((s) => ({ byKey: { ...s.byKey, [key]: result } })),
    clear: (key) =>
      set((s) => {
        const next = { ...s.byKey }
        delete next[key]
        return { byKey: next }
      }),
    setRunning: (key, value) => set((s) => ({ running: { ...s.running, [key]: value } })),
    setError: (key, error) => set((s) => ({ errors: { ...s.errors, [key]: error } })),
    setHydrated: (key, value) => set((s) => ({ hydrated: { ...s.hydrated, [key]: value } })),
  }))
  // Importing a new bundle must wipe the previous bundle's results so nothing
  // stale renders — especially wrong when two bundles share a patient id.
  resetOnBundleChange(() =>
    store.setState({ byKey: {}, running: {}, errors: {}, hydrated: {} }),
  )
  return store
}
