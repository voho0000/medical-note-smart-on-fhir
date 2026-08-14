"use client"

import { Check, Copy, ShieldCheck, Stethoscope } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCopyToClipboard } from '@/src/shared/hooks/use-copy-to-clipboard'
import type { CdssClinicalHandoff } from '../types'

export function ClinicalHandoffCard({
  handoff,
}: {
  handoff: CdssClinicalHandoff
}) {
  const { copied, copy } = useCopyToClipboard()

  return (
    <section
      className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-3 dark:border-blue-500/25 dark:bg-blue-500/[0.07]"
      aria-labelledby="cdss-clinical-handoff-title"
      data-testid="cdss-clinical-handoff"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 gap-2.5">
          <Stethoscope
            className="mt-0.5 h-5 w-5 shrink-0 text-blue-700 dark:text-blue-300"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h3
              id="cdss-clinical-handoff-title"
              className="text-sm font-semibold text-foreground"
            >
              {handoff.title}
            </h3>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {handoff.summary}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 border-blue-300 bg-background text-blue-800 hover:bg-blue-100 dark:border-blue-500/30 dark:text-blue-200 dark:hover:bg-blue-500/10"
          onClick={() => void copy(handoff.copyText)}
        >
          {copied ? (
            <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
          ) : (
            <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
          )}
          <span aria-live="polite">
            {copied ? handoff.copiedLabel : handoff.copyLabel}
          </span>
        </Button>
      </div>
      <p className="mt-2 flex items-start gap-1.5 border-t border-blue-200/80 pt-2 text-[11px] leading-relaxed text-muted-foreground dark:border-blue-500/20">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {handoff.safetyNote}
      </p>
    </section>
  )
}
