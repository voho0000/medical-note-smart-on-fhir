// Welcome / first-visit onboarding screen.
//
// Renders when neither a SMART-on-FHIR launch nor a locally-imported bundle
// is available. Replaces the empty/erroring panels with a friendly intro
// and three enlarged source cards (local import / demo / SMART) as the main
// call-to-action, over a full-area drag-and-drop zone.
"use client"

import { useCallback, useRef, useState } from 'react'
import { Download, FlaskConical, Hospital, Shield } from 'lucide-react'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useImportBundle } from '@/features/import-bundle/hooks/useImportBundle'

export function WelcomeOnboarding() {
  const { t } = useLanguage()
  const w = (t as any).welcome ?? {}
  const i18n = t.importBundle

  const { importFile, loadDemo, loading, error } = useImportBundle()
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)

  // Separate file input dedicated to the "從本地匯入" info card below;
  // ImportBundleButton (the upper CTA) owns its own input. Both end up
  // calling the same useImportBundle.importFile, so behaviour is
  // identical regardless of which entry point the user clicks.
  const localCardFileRef = useRef<HTMLInputElement>(null)
  const handleLocalCardFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await importFile(file)
    } catch {
      // error surfaces via the hook's `error` state
    } finally {
      if (localCardFileRef.current) localCardFileRef.current.value = ''
    }
  }, [importFile])

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

  const handleLoadDemo = useCallback(async () => {
    try {
      await loadDemo()
    } catch {
      // error surfaces via the hook's `error` state
    }
  }, [loadDemo])

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

      <div className="w-full max-w-4xl text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl overflow-hidden">
          <img
            src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/icon.svg?v=3`}
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

        {loading && (
          <p className="mb-4 text-sm text-blue-600 dark:text-blue-400">
            {i18n.importing}…
          </p>
        )}
        {error && (
          <p className="mb-4 text-sm text-destructive">{error}</p>
        )}

        {/* Three enlarged source cards ARE the primary call-to-action now —
            the standalone import button was removed; the local card opens the
            same file picker, and full-page drag-and-drop still works. */}
        <div className="grid gap-5 text-left sm:grid-cols-3">
          {/* Local-import card — clickable, opens the file picker. */}
          <button
            type="button"
            onClick={() => localCardFileRef.current?.click()}
            disabled={loading}
            className="group flex flex-col rounded-2xl border border-border/60 bg-card/50 p-6 cursor-pointer shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-md dark:hover:border-blue-700 dark:hover:bg-blue-950/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600 transition-transform group-hover:scale-105 dark:bg-blue-950 dark:text-blue-400">
              <Download className="h-6 w-6" />
            </div>
            <h3 className="mb-2 text-base font-semibold sm:text-lg">{w.localTitle ?? 'Local FHIR Bundle'}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {w.localDesc ?? 'Import a JSON bundle — data stays in your browser.'}
            </p>
          </button>

          {/* Demo card — clickable, loads the bundled anonymised demo patient
              through the same import path. Green accent so it reads as the
              low-commitment "just try it" option. */}
          <button
            type="button"
            onClick={handleLoadDemo}
            disabled={loading}
            data-testid="welcome-demo-card"
            className="group flex flex-col rounded-2xl border border-emerald-200 bg-emerald-50/40 p-6 cursor-pointer shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-400 hover:bg-emerald-50/70 hover:shadow-md dark:border-emerald-900 dark:bg-emerald-950/20 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 transition-transform group-hover:scale-105 dark:bg-emerald-950 dark:text-emerald-400">
              <FlaskConical className="h-6 w-6" />
            </div>
            <h3 className="mb-2 text-base font-semibold sm:text-lg">{w.demoTitle ?? 'Try demo data'}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {w.demoDesc ?? 'Load an anonymised sample patient — explore without importing anything.'}
            </p>
          </button>

          {/* SMART-on-FHIR card — purely informational. There's no client-
              side action a welcome-screen user can take here; they need
              to launch from the hospital EHR. Styled as a static info
              block (no hover, no cursor-pointer) so it doesn't lie about
              being interactive. */}
          <div className="flex flex-col rounded-2xl border border-dashed border-border/50 bg-muted/30 p-6">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400">
              <Hospital className="h-6 w-6" />
            </div>
            <h3 className="mb-2 text-base font-semibold sm:text-lg">{w.smartTitle ?? 'SMART-on-FHIR'}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {w.smartDesc ?? 'Launch from a hospital EHR — patient data loads automatically.'}
            </p>
          </div>
        </div>

        <p className="mt-5 text-xs text-muted-foreground">
          {w.dragHint ?? 'Tip: you can also drag a .json file anywhere on this screen to import.'}
        </p>

        <input
          ref={localCardFileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleLocalCardFile}
        />

        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Shield className="h-3.5 w-3.5" />
          <span>{w.privacyNote ?? 'Imported bundles stay in your browser only.'}</span>
        </div>
      </div>
    </div>
  )
}
