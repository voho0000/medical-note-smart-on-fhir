// Status Badge Component with Color Mapping
"use client"

import { cn } from "@/src/shared/utils/cn.utils"
import { useLanguage } from "@/src/application/providers/language.provider"

interface StatusBadgeProps {
  status: string
  type: 'clinical' | 'verification'
}

export function StatusBadge({ status, type }: StatusBadgeProps) {
  const { t } = useLanguage()
  if (!status) return null

  const normalizedStatus = status.toLowerCase()

  // Clinical Status Colors (light + dark)
  const clinicalColors: Record<string, string> = {
    'active': 'bg-red-50 text-red-700 ring-red-200 font-semibold dark:bg-red-950/50 dark:text-red-300 dark:ring-red-800',
    'recurrence': 'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:ring-orange-800',
    'relapse': 'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:ring-orange-800',
    'inactive': 'bg-gray-50 text-gray-600 ring-gray-200 dark:bg-muted dark:text-muted-foreground dark:ring-border',
    'remission': 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:ring-blue-800',
    'resolved': 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800',
  }

  // Verification Status Colors (light + dark)
  const verificationColors: Record<string, string> = {
    'confirmed': 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-800',
    'unconfirmed': 'bg-amber-50 text-amber-600 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-800',
    'provisional': 'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-950/50 dark:text-yellow-300 dark:ring-yellow-800',
    'differential': 'bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:ring-purple-800',
    'refuted': 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-800',
    'entered-in-error': 'bg-red-50 text-red-600 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-800',
  }

  const colorMap = type === 'clinical' ? clinicalColors : verificationColors
  const colorClass =
    colorMap[normalizedStatus] ||
    'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-muted dark:text-muted-foreground dark:ring-border'

  // Localised label — falls back to the raw FHIR code if no translation exists
  // (so a novel status value is still shown rather than hidden).
  const ds = (t as any).diagnosisStatus || {}
  const labelMap: Record<string, string> = type === 'clinical' ? ds.clinical || {} : ds.verification || {}
  const label = labelMap[normalizedStatus] || status

  return (
    <span className={cn(
      "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ring-1",
      colorClass
    )}>
      {label}
    </span>
  )
}
