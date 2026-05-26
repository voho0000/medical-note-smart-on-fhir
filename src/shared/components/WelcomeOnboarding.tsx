// Welcome / first-visit onboarding screen.
//
// Renders when neither a SMART-on-FHIR launch nor a locally-imported bundle
// is available — replaces the empty/erroring panels with a friendly intro
// + the same Import Bundle button the header uses (re-mounted inline so
// the CTA is in front of the user).
"use client"

import { Upload, Hospital, Shield } from 'lucide-react'
import { useLanguage } from '@/src/application/providers/language.provider'
import { ImportBundleButton } from '@/features/import-bundle/ImportBundleButton'

export function WelcomeOnboarding() {
  const { t } = useLanguage()
  const w = (t as any).welcome ?? {}

  return (
    <div className="flex h-full w-full items-center justify-center px-4 py-8">
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
        <p className="mb-10 text-xs text-muted-foreground">
          {w.importCta ?? 'Import a FHIR Bundle below to begin'}
        </p>

        <div className="grid gap-4 text-left sm:grid-cols-2">
          <div className="rounded-xl border border-border/60 bg-card/50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                <Upload className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-semibold">{w.localTitle ?? 'Local FHIR Bundle'}</h3>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {w.localDesc ?? 'Upload a JSON bundle — data stays in your browser.'}
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
