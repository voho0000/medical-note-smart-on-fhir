"use client"

import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/src/shared/utils/cn.utils'

/**
 * Something folded on the map — the course timeline, the record's values,
 * the other questions, a module of 03 — with the same chevron every fold on
 * the page has, so a folded box never reads as an empty one.
 */
export function MapFold({
  label,
  hint,
  children,
  bodyClassName,
  size = 'xs',
  testId,
}: {
  label: ReactNode
  /** What is inside, in a word, beside the label. */
  hint?: ReactNode
  children: ReactNode
  bodyClassName?: string
  size?: 'xs' | 'sm'
  testId?: string
}) {
  return (
    <details className="group/fold rounded-md border border-border bg-background" data-testid={testId}>
      <summary
        className={cn(
          'flex min-h-11 cursor-pointer list-none items-center gap-2 px-2.5 font-medium text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden',
          size === 'sm' ? 'text-sm' : 'text-xs',
        )}
      >
        <span className="min-w-0 flex-1">{label}</span>
        {hint ? <span className="shrink-0 text-[11px] font-normal text-muted-foreground">{hint}</span> : null}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open/fold:rotate-180" aria-hidden="true" />
      </summary>
      <div className={cn('border-t border-border', bodyClassName)}>{children}</div>
    </details>
  )
}
