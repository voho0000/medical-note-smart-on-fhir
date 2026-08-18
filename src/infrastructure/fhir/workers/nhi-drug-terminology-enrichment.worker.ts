/// <reference lib="webworker" />

// Off-main-thread NHI drug terminology enrichment.
//
// The enrichment service loads a ~12MB generated terminology snapshot, whose
// JSON.parse alone freezes an old hospital PC for seconds. Everything the
// service does — snapshot parse, resolution, MedicationKnowledge/Provenance
// construction — runs here instead, so the workspace keeps painting while a
// stored bundle is upgraded.
//
// The service module is imported dynamically (not statically) for the same
// reason it is inside the service itself: the snapshot chunk must not be
// fetched until an eligible prescription actually exists.

declare const self: DedicatedWorkerGlobalScope

self.postMessage({ type: 'progress', phase: 'ready' })

self.onmessage = (
  event: MessageEvent<{
    bundle: Record<string, unknown>
    recordedAt?: string
  }>,
) => {
  void import('../services/nhi-drug-terminology-enrichment.service')
    .then(async ({ enrichBundleWithNhiDrugTerminology }) => {
      const { bundle, recordedAt } = event.data
      const result = await enrichBundleWithNhiDrugTerminology(
        bundle,
        recordedAt ? { recordedAt } : {},
      )
      self.postMessage({ type: 'success', result })
    })
    .catch((error) => {
      // Terminology is supplemental: report the worker as unavailable so the
      // caller can retry on the main thread rather than losing the bundle.
      const detail = error instanceof Error ? error.message : 'Unknown worker error'
      self.postMessage({
        type: 'unavailable',
        error: `Drug terminology worker could not load: ${detail}`,
      })
    })
}

export {}
