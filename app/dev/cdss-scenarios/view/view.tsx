'use client'
// Dev-only: the real CDSS feature (LiveFeature) over the imported scenario
// bundle, at the width of the right panel, without the sign-in shell.
import LiveFeature from '@/features/clinical-decision-support/LiveFeature'
import { QueryProvider } from '@/src/application/providers/query-provider'
import { ThemeProvider } from '@/src/application/providers/theme.provider'
import { FontSizeProvider } from '@/src/application/providers/font-size.provider'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { AudienceProvider } from '@/src/application/providers/audience.provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useEffect } from 'react'
import { installMeasure } from './measure'
import { installSimulate } from './simulate'
import { getCdssDecisionTimings } from '@/features/clinical-decision-support/stores/cdss-decision-timing.store'
import index from '../bundles/index.json'
import { DataSelectionProvider } from '@/src/application/providers/data-selection.provider'

// StrictMode runs effects twice in development; measure once per page load.
let measuring = false

export default function View() {
  useEffect(() => {
    installMeasure()
    installSimulate()
    // The in-memory decision timings, for the measurement to read back.
    ;(window as unknown as { __cdssDecisionTimings: typeof getCdssDecisionTimings }).__cdssDecisionTimings = getCdssDecisionTimings
    const id = sessionStorage.getItem('sim-current')
    if (!id || sessionStorage.getItem('sim-auto') !== '1' || measuring) return
    measuring = true
    const scenario = index.find((s) => s.id === id)
    const w = window as unknown as { __cdssMeasure: () => unknown }
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    void (async () => {
      for (let i = 0; i < 40 && !document.querySelector('[data-testid^="cdss-section-module-"], [data-testid="cdss-hf-visit-flow"], [data-testid="cdss-af-visit-flow"], [data-testid^="cdss-visit-"]'); i += 1) await sleep(500)
      await sleep(1500)
      if (scenario?.page === 'af') {
        const button = [...document.querySelectorAll('button')].find((b) => /心房顫動/.test(b.textContent || ''))
        button?.click()
        await sleep(2500)
      }
      const result = w.__cdssMeasure()
      const variant = sessionStorage.getItem('sim-variant')
      // The 'new' run also walks the visit as a cardiologist would: answers,
      // then every queued decision's primary button.
      const simulation = variant === 'new' && scenario?.visit
        ? await (window as unknown as { __cdssSimulate: (visit: unknown) => Promise<unknown> }).__cdssSimulate(scenario.visit)
        : undefined
      await fetch('/api/dev-sim-log', { method: 'POST', body: JSON.stringify({ id, variant, at: new Date().toISOString(), result, simulation }) })
      sessionStorage.removeItem('sim-current')
      if (!JSON.parse(sessionStorage.getItem('sim-queue') || '[]').length) sessionStorage.removeItem('sim-auto')
      window.location.href = '/dev/cdss-scenarios'
    })()
  }, [])
  return (
    <QueryProvider>
      <ThemeProvider>
        <FontSizeProvider>
          <LanguageProvider>
            <AudienceProvider>
              <TooltipProvider>
              <DataSelectionProvider>
                <div className="flex min-h-screen justify-end bg-muted/30">
                  <aside data-testid="sim-right-panel" className="@container w-[880px] max-w-full border-l border-border bg-background p-3">
                    <a href="/dev/cdss-scenarios" className="mb-2 block text-xs text-muted-foreground underline">← 換病人</a>
                    <LiveFeature />
                  </aside>
                </div>
              </DataSelectionProvider>
              </TooltipProvider>
            </AudienceProvider>
          </LanguageProvider>
        </FontSizeProvider>
      </ThemeProvider>
    </QueryProvider>
  )
}
