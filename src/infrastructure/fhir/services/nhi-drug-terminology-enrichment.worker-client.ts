// Worker routing for NHI drug terminology enrichment.
//
// Kept in its own module so the worker entry can import the enrichment service
// without importing this file back — a `new Worker(new URL(...))` reference
// inside the worker's own module graph would make the bundler emit the worker
// chunk recursively.
//
// Mirrors features/import-bundle/services/local-import-file.service.ts: try the
// worker, fall back to the main thread when it cannot start. Node/Jest and SSR
// have no Worker at all and take the direct path, so the service stays directly
// callable and unit-testable.

import type { NhiDrugTerminologyEnrichmentResult } from './nhi-drug-terminology-enrichment.service'

type WorkerSuccess = {
  type: 'success'
  result: NhiDrugTerminologyEnrichmentResult
}

type WorkerUnavailable = {
  type: 'unavailable'
  error: string
}

type WorkerProgress = {
  type: 'progress'
  phase: 'ready'
}

type WorkerResponse = WorkerSuccess | WorkerUnavailable | WorkerProgress

class WorkerStartupError extends Error {}

// A cold worker must download and evaluate its chunk; 2s matches the SDK-import
// worker's budget for "the browser/build combination cannot start a module
// worker at all".
const WORKER_STARTUP_TIMEOUT_MS = 2_000
// The snapshot parse plus resolution on an old hospital PC is seconds, not
// minutes. Past this the main-thread path is not a useful retry either, so the
// caller gets the unenriched bundle instead of an indefinite wait.
const WORKER_ENRICHMENT_TIMEOUT_MS = 60_000

async function enrichOnMainThread(
  bundle: Record<string, unknown>,
  options: { recordedAt?: string },
): Promise<NhiDrugTerminologyEnrichmentResult> {
  const { enrichBundleWithNhiDrugTerminology } = await import(
    './nhi-drug-terminology-enrichment.service'
  )
  return enrichBundleWithNhiDrugTerminology(bundle, options)
}

function enrichInWorker(
  bundle: Record<string, unknown>,
  options: { recordedAt?: string },
): Promise<NhiDrugTerminologyEnrichmentResult> {
  return new Promise<NhiDrugTerminologyEnrichmentResult>((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/nhi-drug-terminology-enrichment.worker.ts', import.meta.url),
      { type: 'module' },
    )
    let started = false
    const startupTimeout = setTimeout(() => {
      worker.terminate()
      reject(new WorkerStartupError('Drug terminology worker did not start'))
    }, WORKER_STARTUP_TIMEOUT_MS)
    const enrichmentTimeout = setTimeout(() => {
      worker.terminate()
      reject(new WorkerStartupError('Drug terminology worker timed out'))
    }, WORKER_ENRICHMENT_TIMEOUT_MS)
    const finish = () => {
      clearTimeout(startupTimeout)
      clearTimeout(enrichmentTimeout)
      worker.terminate()
    }

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.type === 'progress') {
        started = true
        clearTimeout(startupTimeout)
        return
      }
      finish()
      if (event.data.type === 'success') resolve(event.data.result)
      else reject(new WorkerStartupError(event.data.error))
    }
    worker.onerror = (event) => {
      finish()
      reject(new WorkerStartupError(
        event.message
          || (started ? 'Drug terminology worker failed' : 'Drug terminology worker failed to load'),
      ))
    }

    try {
      worker.postMessage({ bundle, ...(options.recordedAt ? { recordedAt: options.recordedAt } : {}) })
    } catch (error) {
      // Structured clone can refuse a bundle carrying a non-cloneable value.
      // That is a main-thread problem, not a lost import.
      finish()
      reject(new WorkerStartupError(
        error instanceof Error ? error.message : 'Bundle could not be transferred to the worker',
      ))
    }
  })
}

/**
 * Enrich a bundle with NHI drug terminology without blocking the main thread.
 *
 * Falls back to the direct in-process call whenever a worker is unavailable —
 * Node/Jest, SSR, browsers that cannot start a module worker, and bundles that
 * cannot be structured-cloned — so the result contract is identical either way.
 */
export async function enrichBundleWithNhiDrugTerminologyOffMainThread(
  bundle: Record<string, unknown>,
  options: { recordedAt?: string } = {},
): Promise<NhiDrugTerminologyEnrichmentResult> {
  if (typeof Worker === 'undefined') return enrichOnMainThread(bundle, options)

  try {
    return await enrichInWorker(bundle, options)
  } catch (error) {
    if (error instanceof WorkerStartupError) return enrichOnMainThread(bundle, options)
    throw error
  }
}
