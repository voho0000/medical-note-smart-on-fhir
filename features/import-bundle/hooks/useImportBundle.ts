// Shared FHIR Bundle import logic — used by both the header
// `ImportBundleButton` and the drop zone in `WelcomeOnboarding` so the
// parse/save/cache-invalidate pipeline lives in one place.
"use client"

import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'
import { shouldUseLocalBundle } from '@/src/infrastructure/fhir/client/fhir-client.service'

export interface UseImportBundleReturn {
  /** Parse + persist a FHIR Bundle file. Throws on validation error;
   *  errors are also captured into the `error` state for UI use. */
  importFile: (file: File) => Promise<void>
  /** Wipe the imported bundle from localStorage. */
  clear: () => Promise<void>
  loading: boolean
  error: string | null
  hasBundle: boolean
  bundleIsActive: boolean
}

export function useImportBundle(): UseImportBundleReturn {
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // SSR-safe initial values (false); synced post-hydration so server and
  // client first paints match.
  const [hasBundle, setHasBundle] = useState(false)
  const [bundleIsActive, setBundleIsActive] = useState(false)

  useEffect(() => {
    setHasBundle(LocalBundleService.hasData())
    setBundleIsActive(shouldUseLocalBundle())
  }, [])

  const importFile = useCallback(async (file: File) => {
    setLoading(true)
    setError(null)
    try {
      const text = await file.text()
      const bundle = JSON.parse(text)
      if (bundle.resourceType !== 'Bundle') {
        throw new Error('Not a FHIR Bundle (resourceType must be "Bundle")')
      }
      const parsed = LocalBundleService.parse(bundle)
      if (!parsed) {
        throw new Error('Bundle must contain at least one Patient resource')
      }
      LocalBundleService.save(bundle)
      setHasBundle(true)
      setBundleIsActive(shouldUseLocalBundle())
      await queryClient.invalidateQueries()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to parse bundle'
      setError(msg)
      throw err instanceof Error ? err : new Error(msg)
    } finally {
      setLoading(false)
    }
  }, [queryClient])

  const clear = useCallback(async () => {
    LocalBundleService.clear()
    setHasBundle(false)
    setBundleIsActive(false)
    setError(null)
    await queryClient.invalidateQueries()
  }, [queryClient])

  return { importFile, clear, loading, error, hasBundle, bundleIsActive }
}
