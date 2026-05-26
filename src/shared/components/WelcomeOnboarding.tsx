// Welcome / first-visit onboarding screen.
//
// Renders when neither a SMART-on-FHIR launch nor a locally-imported bundle
// is available. Replaces the empty/erroring panels with a friendly intro,
// a full-area drag-and-drop zone, and the same import button the header
// uses (re-mounted inline so the CTA is in front of the user).
"use client"

import { useCallback, useRef, useState } from 'react'
import { Download, Hospital, Shield } from 'lucide-react'
import { useLanguage } from '@/src/application/providers/language.provider'
import { ImportBundleButton } from '@/features/import-bundle/ImportBundleButton'
import { useImportBundle } from '@/features/import-bundle/hooks/useImportBundle'

export function WelcomeOnboarding() {
  const { t } = useLanguage()
  const w = (t as any).welcome ?? {}
  const i18n = t.importBundle

  const { importFile, loading, error } = useImportBundle()
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only count file drags (ignore in-page text/element drags).
    if (!e.dataTransfer?.types?.includes('Files')) return
    dragCounter.current += 1
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current -= 1
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setIsDragging(false)
    }
  }, [])

  // `dragover` fires continuously while a file is over the zone; must
  // preventDefault() so the browser allows the drop event to fire.
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current = 0
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    try {
      await importFile(file)
    } catch {
      // error is surfaced via the hook's `error` state below.
    }
  }, [importFile])

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`relative flex h-full w-full items-center justify-center px-4 py-8 transition-colors ${
        isDragging ? 'bg-blue-50/60 dark:bg-blue-950/30' : ''
      }`}
    >
      {/* Drag-over overlay — covers the screen with a dashed border so the
          drop target is unambiguous. */}
      {isDragging && (
        <div className="pointer-events-none absolute inset-4 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-blue-500 bg-blue-50/80 backdrop-blur-sm dark:border-blue-400 dark:bg-blue-950/60">
          <div className="flex flex-col items-center gap-2 text-blue-700 dark:text-blue-300">
            <Download className="h-10 w-10" />
            <p className="text-base font-semibold">
              {w.dropHere ?? 'Drop FHIR Bundle to import'}
            </p>
          </div>
        </div>
      )}

      <div className="w-full max-w-2xl text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl overflow-hidden">
          <img
            src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/icon.svg`}
            alt="App Icon"
            className="h-full w-full object-contain"
          />
        </div>

        <h2 className="mb-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:text-3xl">
          {w.title ?? 'Welcome'}
        </h2>

        <p className="mx-auto mb-8 max-w-md text-sm text-muted-foreground sm:text-base">
          {w.description ?? 'Import a FHIR Bundle or launch from your EHR to get started.'}
        </p>

        <div className="mb-2 flex justify-center">
          <ImportBundleButton />
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          {w.importCta ?? 'Import a FHIR Bundle below to begin'}
        </p>
        <p className="mb-10 text-xs text-muted-foreground">
          {w.dragHint ?? 'or drag-and-drop a .json file anywhere on this screen'}
        </p>

        {loading && (
          <p className="mb-4 text-sm text-blue-600 dark:text-blue-400">
            {i18n.importing}…
          </p>
        )}
        {error && (
          <p className="mb-4 text-sm text-destructive">{error}</p>
        )}

        <div className="grid gap-4 text-left sm:grid-cols-2">
          <div className="rounded-xl border border-border/60 bg-card/50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                <Download className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-semibold">{w.localTitle ?? 'Local FHIR Bundle'}</h3>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {w.localDesc ?? 'Import a JSON bundle — data stays in your browser.'}
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400">
                <Hospital className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-semibold">{w.smartTitle ?? 'SMART-on-FHIR'}</h3>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {w.smartDesc ?? 'Launch from a hospital EHR — patient data loads automatically.'}
            </p>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Shield className="h-3.5 w-3.5" />
          <span>{w.privacyNote ?? 'Imported bundles stay in your browser only.'}</span>
        </div>
      </div>
    </div>
  )
}
