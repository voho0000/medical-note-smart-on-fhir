'use client'

// Which data source is currently driving the app. This is presentation and
// scoping information only — it is NOT an authorization signal.
//
// Automatic cloud-AI analysis used to be gated by a per-source consent layer
// (an onboarding question, a browser-wide SMART decision, and a per-import
// receipt with a same-day memory). That layer is gone: automatic generation is
// off by default and the persisted "自動產生" switch is the single control.
// The VGH-TPE Medcloud launch keeps its own separate, credential-gated runner
// (see use-medcloud-auto-summary.hook.ts); it never consults this module.

import { useMemo, useSyncExternalStore } from 'react'
import { shouldUseLocalBundle } from '@/src/infrastructure/fhir/client/fhir-client.service'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'
import { BUNDLE_CHANGED_EVENT } from '@/src/shared/utils/reset-on-bundle-change'

/** `demo` = bundled demo patient, `local` = imported file, `other` = SMART. */
export type AiDataSource = 'demo' | 'local' | 'other'

export interface AiDataSourceState {
  source: AiDataSource
  /** Identifies the active local import so per-import scopes can key off it. */
  importId: string | null
}

/** True only when the currently active source is the bundled demo. A leftover
 * demo flag must not win over a live SMART launch, which takes source priority. */
export function isDemoDataActive(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return shouldUseLocalBundle() && LocalBundleService.isDemoData()
  } catch {
    return false
  }
}

export function getAiDataSourceState(): AiDataSourceState {
  if (typeof window === 'undefined') return { source: 'other', importId: null }

  let localBundleActive = false
  try {
    localBundleActive = shouldUseLocalBundle()
  } catch {
    localBundleActive = false
  }
  if (!localBundleActive) return { source: 'other', importId: null }
  if (isDemoDataActive()) return { source: 'demo', importId: null }

  let importId: string | null = null
  try {
    importId = LocalBundleService.getActiveImportId()
  } catch {
    importId = null
  }
  return { source: 'local', importId }
}

type AiDataSourceSnapshot = readonly [source: AiDataSource, importId: string | null]

const SERVER_SNAPSHOT = JSON.stringify(['other', null] satisfies AiDataSourceSnapshot)

function getAiDataSourceSnapshot(): string {
  const state = getAiDataSourceState()
  return JSON.stringify([state.source, state.importId] satisfies AiDataSourceSnapshot)
}

function subscribeToAiDataSource(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  window.addEventListener(BUNDLE_CHANGED_EVENT, onStoreChange)
  window.addEventListener('storage', onStoreChange)
  return () => {
    window.removeEventListener(BUNDLE_CHANGED_EVENT, onStoreChange)
    window.removeEventListener('storage', onStoreChange)
  }
}

export function useAiDataSource(): AiDataSourceState {
  const snapshot = useSyncExternalStore(
    subscribeToAiDataSource,
    getAiDataSourceSnapshot,
    () => SERVER_SNAPSHOT,
  )

  return useMemo(() => {
    const [source, importId] = JSON.parse(snapshot) as AiDataSourceSnapshot
    return { source, importId }
  }, [snapshot])
}
