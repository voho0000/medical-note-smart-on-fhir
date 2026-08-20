"use client"

import { Building2 } from 'lucide-react'
import { TapTooltip } from '@/src/shared/components/TapTooltip'
import { cn } from '@/src/shared/utils/cn.utils'
import { formatOrganizationDisplay } from '@/src/shared/utils/organization-display'
import { REPORT_SOURCE_TONE } from './report-color-roles'

/** Backwards-compatible name for report callers and tests. */
export const formatReportInstitution = formatOrganizationDisplay

/** Compact institution label that always exposes its complete source text.
 *  The label truncates, so "which hospital ran this?" lives ONLY in the bubble
 *  — TapTooltip keeps that answer reachable on a touch screen. It also stops
 *  the tap from propagating, so tapping the institution inside a report header
 *  reveals the name instead of toggling the row. */
export function ReportInstitutionLabel({
  institution,
  className,
}: {
  institution: string
  className?: string
}) {
  const displayInstitution = formatReportInstitution(institution)
  return (
    <TapTooltip
      side="top"
      aria-label={displayInstitution}
      contentClassName="max-w-sm break-words text-left"
      content={displayInstitution}
      className={cn(
        'inline-flex min-w-0 items-center gap-1 text-xs',
        REPORT_SOURCE_TONE,
        className,
      )}
    >
      <Building2 className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{displayInstitution}</span>
    </TapTooltip>
  )
}
