"use client"

// Thin wrapper over the shared Card primitives with the same anatomy as
// FeatureCard (marker · icon · title · count, actions on the right), plus the
// two things the overview needs and FeatureCard deliberately does not offer:
// a header-right control slot and a height-bounded, non-scrolling body.
import type { ReactNode, Ref } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/src/shared/utils/cn.utils'

export function OverviewSectionCard({
  id,
  icon: Icon,
  title,
  count,
  actions,
  children,
  bounded = false,
  contentRef,
  flash = false,
  headingRef,
}: {
  id?: string
  icon: LucideIcon
  title: string
  count?: string
  actions?: ReactNode
  children: ReactNode
  /** Wide 2×2 mode: the card fills its grid cell and clips instead of
   *  scrolling, so the caller can decide how many rows to render. */
  bounded?: boolean
  contentRef?: Ref<HTMLDivElement>
  /** Narrow mode: the section was just jumped to from the header tiles. */
  flash?: boolean
  headingRef?: Ref<HTMLDivElement>
}) {
  return (
    <Card
      id={id}
      data-overview-section={id}
      className={cn(
        'gap-2 rounded-lg border-border bg-card py-2 shadow-[0_1px_2px_rgb(15_23_42/0.04)] dark:shadow-none md:py-2.5',
        // Fill the grid cell rather than hugging the content: the row budget is
        // measured from the content box, so a card that shrank to fit an empty
        // state would never grow back.
        bounded && 'min-h-0 flex-1 overflow-hidden',
      )}
    >
      <CardHeader className="gap-2 px-3.5 sm:px-5">
        <CardTitle
          ref={headingRef}
          className={cn(
            'flex min-w-0 items-center gap-2 text-base',
            flash && 'resource-flash',
          )}
        >
          <span
            data-slot="clinical-section-marker"
            aria-hidden="true"
            className="h-4 w-0.5 shrink-0 rounded-sm bg-primary/70"
          />
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="whitespace-nowrap">{title}</span>
          {count && (
            <span className="min-w-0 truncate text-[0.8125rem] font-medium text-muted-foreground">
              {count}
            </span>
          )}
        </CardTitle>
        {actions && (
          <CardAction className="flex items-center gap-1.5">{actions}</CardAction>
        )}
      </CardHeader>
      <CardContent
        ref={contentRef}
        className={cn(
          'px-3.5 sm:px-5',
          bounded && 'flex min-h-0 flex-1 flex-col overflow-hidden',
        )}
      >
        {children}
      </CardContent>
    </Card>
  )
}
