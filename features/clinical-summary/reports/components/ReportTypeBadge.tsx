import { Badge } from '@/components/ui/badge'
import { useLanguage } from '@/src/application/providers/language.provider'
import { cn } from '@/src/shared/utils/cn.utils'
import type { ReportGroup } from '../types'

const TONE_BY_GROUP: Record<ReportGroup, string> = {
  lab: 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-400/35 dark:bg-blue-400/10 dark:text-blue-200',
  imaging: 'border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-400/35 dark:bg-cyan-400/10 dark:text-cyan-200',
  pathology: 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-400/35 dark:bg-violet-400/10 dark:text-violet-200',
  'cancer-screening': 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-400/35 dark:bg-fuchsia-400/10 dark:text-fuchsia-200',
  vitals: 'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-400/35 dark:bg-teal-400/10 dark:text-teal-200',
  procedures: 'border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-400/35 dark:bg-indigo-400/10 dark:text-indigo-200',
  other: 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-400/35 dark:bg-slate-400/10 dark:text-slate-200',
}

export function ReportTypeBadge({ group, className }: { group: ReportGroup; className?: string }) {
  const { t } = useLanguage()
  const labels = t.reports.typeBadges
  const labelByGroup: Record<ReportGroup, string> = {
    lab: labels.lab,
    imaging: labels.imaging,
    pathology: labels.pathology,
    'cancer-screening': labels.cancerScreening,
    vitals: labels.vitals,
    procedures: labels.procedures,
    other: labels.other,
  }

  return (
    <Badge
      variant="outline"
      data-testid="report-type-badge"
      className={cn(
        'shrink-0 px-1.5 py-0 text-[0.6875rem] font-semibold',
        TONE_BY_GROUP[group],
        className,
      )}
    >
      {labelByGroup[group]}
    </Badge>
  )
}
