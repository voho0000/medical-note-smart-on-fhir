'use client'

import { AlertTriangle } from 'lucide-react'
import type { AiModelExecution } from '@/src/core/entities/ai-model-execution.entity'
import { useLanguage } from '@/src/application/providers/language.provider'
import { modelExecutionNotice } from '@/src/shared/utils/ai-model-execution'

export function ModelExecutionNotice({ execution }: { execution?: AiModelExecution }) {
  return execution ? <ReportedModelNotice execution={execution} /> : null
}

function ReportedModelNotice({ execution }: { execution: AiModelExecution }) {
  const { locale } = useLanguage()
  const notice = modelExecutionNotice(execution, locale)
  if (!notice) return null
  return (
    <div role="status" className="flex min-w-0 items-start gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs leading-relaxed text-foreground">
      <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <span className="min-w-0 break-words">{notice}</span>
    </div>
  )
}
