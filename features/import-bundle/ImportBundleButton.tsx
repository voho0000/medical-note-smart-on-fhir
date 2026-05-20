"use client"

import { useRef, useState, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Upload, Trash2, Database } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LocalBundleService } from "@/src/infrastructure/fhir/services/local-bundle.service"
import { shouldUseLocalBundle } from "@/src/infrastructure/fhir/client/fhir-client.service"
import { useLanguage } from "@/src/application/providers/language.provider"

export function ImportBundleButton() {
  const fileRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const { t } = useLanguage()
  const i18n = t.importBundle
  // We track two distinct facts so the UI accurately reflects current mode:
  //   - `hasBundle`: a bundle exists in localStorage (controls the Trash button —
  //     user can always clear it).
  //   - `bundleIsActive`: the bundle is the data source RIGHT NOW (controls the
  //     "Local data" badge so we don't mislead the user when SMART has taken
  //     precedence over a leftover bundle).
  // Both start false on SSR + first client render so the initial DOM matches;
  // the real values are synced in the effect below (post-hydration).
  const [hasBundle, setHasBundle] = useState(false)
  const [bundleIsActive, setBundleIsActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setHasBundle(LocalBundleService.hasData())
    setBundleIsActive(shouldUseLocalBundle())
  }, [])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
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
      setError(err instanceof Error ? err.message : 'Failed to parse bundle')
    } finally {
      setLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleClear = async () => {
    LocalBundleService.clear()
    setHasBundle(false)
    setBundleIsActive(false)
    setError(null)
    await queryClient.invalidateQueries()
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {/* "Local data" badge only when the bundle is genuinely the data
            source — SMART context, if active, suppresses the badge so users
            aren't misled. The bundle's presence is still indicated by the
            Trash button below. */}
        {bundleIsActive && (
          <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            <Database className="h-3 w-3" />
            {i18n.localData}
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-8 sm:h-9 gap-1.5 px-3 text-xs sm:text-sm"
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          title={i18n.importTitle}
        >
          <Upload className="h-3.5 w-3.5" />
          {loading ? i18n.importing : i18n.button}
        </Button>
        {hasBundle && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 sm:h-9 sm:w-9 text-destructive hover:text-destructive"
            onClick={handleClear}
            title={i18n.clearTitle}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {error && (
        <p className="text-xs text-destructive px-1">{error}</p>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  )
}
