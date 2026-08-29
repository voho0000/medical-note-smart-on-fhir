import type { ReportSourceProgram } from '../types'

export function ReportSourceProgramBadge({
  sourceProgram,
  label,
}: {
  sourceProgram?: ReportSourceProgram
  label?: string
}) {
  if (sourceProgram !== 'adult-preventive' || !label) return null

  return (
    <span
      data-testid="report-source-program"
      aria-label={label}
      className="inline-flex shrink-0 items-center rounded-full border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-xs font-medium text-primary"
    >
      {label}
    </span>
  )
}
