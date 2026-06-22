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
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'
import { shouldUseLocalBundle } from '@/src/infrastructure/fhir/client/fhir-client.service'

const BUNDLE_CHANGED_EVENT = 'mediprisma:local-bundle-changed'
// Set while the currently-loaded bundle is the bundled demo ("試用資料"), so the
// UI can show a "您正在檢視示範資料" banner and so a real import clears it.
const DEMO_FLAG_KEY = 'mediprisma:demo-active'

function notifyBundleChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(BUNDLE_CHANGED_EVENT))
  }
}

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
    await LocalBundleService.clear()
    localStorage.removeItem(DEMO_FLAG_KEY)
    setHasBundle(false)
    setBundleIsActive(false)
    setIsDemo(false)
    setError(null)
    notifyBundleChanged()
    await queryClient.invalidateQueries()
  }, [queryClient])

  return { importFile, loadDemo, clear, loading, error, hasBundle, bundleIsActive, isDemo }
}
