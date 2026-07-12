// Shared FHIR Bundle import logic — used by both the header
// `ImportBundleButton` and the drop zone in `WelcomeOnboarding` so the
// parse/save/cache-invalidate pipeline lives in one place.
//
// Cross-instance sync: each call to this hook owns its own React state,
// but localStorage is global. When one instance imports / clears the
// bundle, all other instances need to learn about it (e.g. so the header
// trash button appears after the welcome screen drops a file). We solve
// that with a window event the writer dispatches and every instance
// subscribes to.
"use client"

import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { LocalBundleService, DEMO_FLAG_KEY } from '@/src/infrastructure/fhir/services/local-bundle.service'
import { shouldUseLocalBundle } from '@/src/infrastructure/fhir/client/fhir-client.service'
import { purgeAiResultCaches } from '@/src/infrastructure/cache/encrypted-session-cache'
import {
  BUNDLE_CHANGED_EVENT,
  notifyBundleChanged,
} from '@/src/shared/utils/reset-on-bundle-change'

export interface UseImportBundleReturn {
  /** Parse + persist a FHIR Bundle file. Throws on validation error;
   *  errors are also captured into the `error` state for UI use. */
  importFile: (file: File) => Promise<void>
  /** Fetch + load the bundled demo patient ("試用資料 / 示範病人"). Goes through
   *  the exact same parse/save/cache-invalidate path as a real import. */
  loadDemo: () => Promise<void>
  /** Wipe the imported bundle from localStorage. */
  clear: () => Promise<void>
  loading: boolean
  error: string | null
  hasBundle: boolean
  bundleIsActive: boolean
  /** True when the active bundle is the bundled demo. */
  isDemo: boolean
}

export function useImportBundle(): UseImportBundleReturn {
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // SSR-safe initial values (false); synced post-hydration so server and
  // client first paints match.
  const [hasBundle, setHasBundle] = useState(false)
  const [bundleIsActive, setBundleIsActive] = useState(false)
  const [isDemo, setIsDemo] = useState(false)

  useEffect(() => {
    const sync = () => {
      setHasBundle(LocalBundleService.hasData())
      setBundleIsActive(shouldUseLocalBundle())
      setIsDemo(localStorage.getItem(DEMO_FLAG_KEY) === '1')
    }
    sync() // initial
    window.addEventListener(BUNDLE_CHANGED_EVENT, sync)
    return () => window.removeEventListener(BUNDLE_CHANGED_EVENT, sync)
  }, [])

  // Shared persist core for both real imports and the demo loader: validate,
  // save, mark/unmark demo, then refresh presence state + invalidate queries.
  const persistBundle = useCallback(async (bundle: any, demo: boolean) => {
    if (bundle?.resourceType !== 'Bundle') {
      throw new Error('Not a FHIR Bundle (resourceType must be "Bundle")')
    }
    const parsed = LocalBundleService.parse(bundle)
    if (!parsed) {
      throw new Error('Bundle must contain at least one Patient resource')
    }
    await LocalBundleService.save(bundle)
    if (demo) localStorage.setItem(DEMO_FLAG_KEY, '1')
    else localStorage.removeItem(DEMO_FLAG_KEY)
    // Importing NEW data must not leave the PREVIOUS bundle's derived results
    // around, or the render goes inconsistent (old AI summary / safety scan /
    // report interpretation shown against new clinical data — worst when the two
    // bundles share a patient id). Drop the persisted AI caches here; the
    // in-memory AI stores reset off the notifyBundleChanged() event below. This
    // is the same cleanup clear() does — import = clear-then-load.
    purgeAiResultCaches()
    setHasBundle(true)
    setBundleIsActive(shouldUseLocalBundle())
    setIsDemo(demo)
    notifyBundleChanged()
    await queryClient.invalidateQueries()
  }, [queryClient])

  const importFile = useCallback(async (file: File) => {
    setLoading(true)
    setError(null)
    try {
      await persistBundle(JSON.parse(await file.text()), false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to parse bundle'
      setError(msg)
      throw err instanceof Error ? err : new Error(msg)
    } finally {
      setLoading(false)
    }
  }, [persistBundle])

  const loadDemo = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const base = process.env.NEXT_PUBLIC_BASE_PATH || ''
      // Default caching (revalidates against the server) — NOT force-cache, so a
      // re-published demo bundle (e.g. after a privacy fix) is never served stale.
      const res = await fetch(`${base}/demo/demo-bundle.json`)
      if (!res.ok) throw new Error(`Failed to load demo data (${res.status})`)
      await persistBundle(await res.json(), true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load demo data'
      setError(msg)
      throw err instanceof Error ? err : new Error(msg)
    } finally {
      setLoading(false)
    }
  }, [persistBundle])

  const clear = useCallback(async () => {
    await LocalBundleService.clear() // also removes the demo flag
    // Clearing the bundle must also drop cached AI results (safety scan,
    // insights) so re-importing the same patient starts fresh, not stale.
    purgeAiResultCaches()
    setHasBundle(false)
    setBundleIsActive(false)
    setIsDemo(false)
    setError(null)
    notifyBundleChanged()
    await queryClient.invalidateQueries()
  }, [queryClient])

  return { importFile, loadDemo, clear, loading, error, hasBundle, bundleIsActive, isDemo }
}
