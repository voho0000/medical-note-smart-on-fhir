"use client"

import { Building2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/src/shared/utils/cn.utils'
import { REPORT_SOURCE_TONE } from './report-color-roles'

/** Remove a source-system code appended as the final delimited segment. */
export function formatReportInstitution(institution: string): string {
  const withoutTrailingCode = institution.replace(/\s*[;；,，]\s*\d{6,}\s*$/, '').trim()
  return withoutTrailingCode || institution.trim()
}

/** Compact institution label that always exposes its complete source text. */
export function ReportInstitutionLabel({
  institution,
  className,
}: {
  institution: string
  className?: string
}) {
  const displayInstitution = formatReportInstitution(institution)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex min-w-0 items-center gap-1 text-xs',
            REPORT_SOURCE_TONE,
            className,
          )}
          aria-label={displayInstitution}
        >
          <Building2 className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{displayInstitution}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-sm break-words text-left">
        {displayInstitution}
      </TooltipContent>
    </Tooltip>
  )
}
