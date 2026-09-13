"use client"

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/src/shared/utils/cn.utils'
import { sourceStatusLabel, sourceStatusStyle } from '../renderers/status-presentation'
import type { VisitCoverage } from './types'

/**
 * What 健保 says about this row, in the pack's own words.
 *
 * Two lines that must not be read as one: the guideline target above and the
 * coverage verdict here are separate rulebooks, and the row says which is
 * which. Every word is the pack's; this places the verdict badge and the first
 * sentence, and puts the rest — the full clause and what is still missing —
 * behind 「條文」. A verdict is a reading of the published conditions, never a
 * promise: 給付與否仍由申報時的適應症與審查決定, which is a sentence the pack
 * writes into `covered` summaries itself.
 */
export function CoverageLine({
  coverage,
  isEnglish,
  testIdPrefix,
  moduleId,
}: {
  coverage: VisitCoverage
  isEnglish: boolean
  testIdPrefix: string
  moduleId: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="mt-0.5 text-xs leading-relaxed"
      data-testid={`${testIdPrefix}-coverage-${moduleId}`}
      data-coverage-status={coverage.status}
    >
      <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1">
        <span className="font-medium text-foreground">
          {isEnglish ? 'NHI' : '健保'}
        </span>
        <Badge className={cn('h-5 shrink-0 px-1.5 text-[11px]', sourceStatusStyle[coverage.status])}>
          {sourceStatusLabel(coverage.status, isEnglish)}
        </Badge>
        <span className="min-w-0 text-muted-foreground">{coverage.firstSentence}</span>
        <button
          type="button"
          className="inline-flex min-h-6 shrink-0 items-center gap-1 rounded-md px-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          data-testid={`${testIdPrefix}-coverage-toggle-${moduleId}`}
        >
          <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} aria-hidden="true" />
          {isEnglish ? 'Clause' : '條文'}
        </button>
      </p>
      {open ? (
        <div
          className="mt-1 rounded-md border border-border bg-muted/[0.12] px-2.5 py-2"
          data-testid={`${testIdPrefix}-coverage-detail-${moduleId}`}
        >
          <p className="text-[11px] leading-relaxed text-foreground">{coverage.summary}</p>
          {coverage.missingData && coverage.missingData.length > 0 ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] leading-4 text-amber-800 dark:text-amber-300">
              {coverage.missingData.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : null}
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            {coverage.sourceLabel} · {coverage.version}
          </p>
        </div>
      ) : null}
    </div>
  )
}
