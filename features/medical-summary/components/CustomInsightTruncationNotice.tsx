"use client"

import { AlertCircle } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { LOCAL_INSIGHT_MAX_OUTPUT_TOKENS } from "@/src/shared/constants/clinical-insights.constants"
import { cn } from "@/src/shared/utils/cn.utils"

export function CustomInsightTruncationNotice({ className }: { className?: string }) {
  const { t, locale } = useLanguage()
  const labels = t.medicalSummary

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200",
        className,
      )}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-semibold">{labels.customOutputTruncatedTitle}</p>
        <p className="mt-1 leading-snug">{
          labels.customOutputTruncatedDescription.replace(
            '{tokens}',
            new Intl.NumberFormat(locale).format(LOCAL_INSIGHT_MAX_OUTPUT_TOKENS),
          )
        }</p>
      </div>
    </div>
  )
}
