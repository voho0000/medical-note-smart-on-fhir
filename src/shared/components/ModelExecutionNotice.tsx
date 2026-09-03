'use client'

import { AlertTriangle } from 'lucide-react'
import type { AiModelExecution } from '@/src/core/entities/ai-model-execution.entity'
import { useLanguage } from '@/src/application/providers/language.provider'
import { modelExecutionFallback, modelExecutionNotice } from '@/src/shared/utils/ai-model-execution'
import { InfoHint } from './InfoHint'

export function ModelExecutionInfo({ execution }: { execution?: AiModelExecution }) {
  return execution && !execution.actualModelId ? <UnreportedModelInfo execution={execution} /> : null
}

function UnreportedModelInfo({ execution }: { execution: AiModelExecution }) {
  const { locale } = useLanguage()
  return (
    <InfoHint
      aria-label={locale === 'zh-TW' ? '模型資訊：API 未回報實際模型' : 'Model info: actual model not reported by API'}
      className="h-6 w-6 shrink-0 text-muted-foreground"
    >
      {modelExecutionNotice(execution, locale)}
    </InfoHint>
  )
}

export function ModelExecutionNotice({ execution }: { execution?: AiModelExecution }) {
  return execution && modelExecutionFallback(execution) ? <ReportedModelNotice execution={execution} /> : null
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
