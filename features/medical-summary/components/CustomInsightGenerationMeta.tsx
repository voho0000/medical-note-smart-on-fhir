"use client"

import { ModelExecutionInfo, ModelExecutionNotice } from '@/src/shared/components/ModelExecutionNotice'
import { modelExecutionFallback, modelExecutionLabel } from '@/src/shared/utils/ai-model-execution'
import { useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useLanguage } from "@/src/application/providers/language.provider"
import { getModelDefinition } from "@/src/shared/constants/ai-models.constants"
import { cn } from "@/src/shared/utils/cn.utils"
import type {
  ActiveInsightGeneration,
  InsightGenerationMetadata,
} from "@/features/clinical-insights/types"
import { formatGenerationDuration } from "../utils/summary-generation-info"

interface CustomInsightGenerationMetaProps {
  metadata?: InsightGenerationMetadata | null
  activeGeneration?: ActiveInsightGeneration
  className?: string
}

function ModelName({
  children,
  className,
}: {
  children: string
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "min-w-0 max-w-40 flex-[0_1_auto] cursor-help truncate font-medium text-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            className,
          )}
          tabIndex={0}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={4}
        className="max-w-[min(90vw,32rem)] whitespace-normal break-all text-left text-xs"
      >
        {children}
      </TooltipContent>
    </Tooltip>
  )
}

function RunningMeta({
  activeGeneration,
  className,
}: {
  activeGeneration: ActiveInsightGeneration
  className?: string
}) {
  const { t } = useLanguage()
  const labels = t.medicalSummary
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const elapsedText = formatGenerationDuration(
    Math.max(0, now - activeGeneration.startedAt),
  ) ?? "00:00"
  const ariaLabel = labels.summaryGenerationRunningProvenance
    .replace("{model}", activeGeneration.modelName)
    .replace("{elapsed}", elapsedText)

  return (
    <div
      data-testid="custom-insight-generation-meta"
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground",
        className,
      )}
      role="timer"
      aria-live="off"
      aria-label={ariaLabel}
    >
      <span className="inline-flex shrink-0 items-center gap-1.5 font-medium text-teal-700 dark:text-primary">
        <Loader2
          aria-hidden="true"
          className="h-3 w-3 shrink-0 animate-spin"
        />
        <span>{labels.summaryGenerationRunningLabel}</span>
      </span>
      <span aria-hidden="true" className="shrink-0">·</span>
      <ModelName>{activeGeneration.modelName}</ModelName>
      <span aria-hidden="true" className="shrink-0">·</span>
      <span className="min-w-[5ch] shrink-0 tabular-nums">{elapsedText}</span>
    </div>
  )
}

export function CustomInsightGenerationMeta({
  metadata,
  activeGeneration,
  className,
}: CustomInsightGenerationMetaProps) {
  const { t, locale } = useLanguage()
  const labels = t.medicalSummary

  const completed = useMemo(() => {
    if (!metadata) return null
    const modelName = metadata.modelExecution ? modelExecutionLabel(metadata.modelExecution) : (
      metadata.modelName ?? getModelDefinition(metadata.modelId)?.label ?? metadata.modelId
    )
    if (metadata.source === "pre-generated") {
      return {
        ariaLabel: labels.summaryPreGeneratedProvenance.replace("{model}", modelName),
        modelName,
        preGenerated: true as const,
      }
    }
    if (!Number.isFinite(metadata.generatedAt)) return null
    const generatedAt = new Date(metadata.generatedAt as number)
    if (Number.isNaN(generatedAt.getTime())) return null

    const generatedAtText = new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(generatedAt)
    const durationText = metadata.durationMs === undefined
      ? undefined
      : formatGenerationDuration(metadata.durationMs)
    const ariaLabel = durationText
      ? labels.summaryGenerationProvenanceWithDuration
        .replace("{model}", modelName)
        .replace("{time}", generatedAtText)
        .replace("{duration}", durationText)
      : labels.summaryGenerationProvenance
        .replace("{model}", modelName)
        .replace("{time}", generatedAtText)

    return {
      ariaLabel,
      durationText,
      generatedAtIso: generatedAt.toISOString(),
      generatedAtText,
      modelName,
      preGenerated: false as const,
    }
  }, [labels.summaryGenerationProvenance, labels.summaryGenerationProvenanceWithDuration, labels.summaryPreGeneratedProvenance, locale, metadata])

  if (activeGeneration) {
    return (
      <RunningMeta
        key={activeGeneration.id}
        activeGeneration={activeGeneration}
        className={className}
      />
    )
  }
  if (!completed) return null

  return (
    <div
      data-testid="custom-insight-generation-meta"
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground",
        className,
      )}
      aria-label={completed.ariaLabel}
    >
      {completed.preGenerated ? (
        <>
          <span className="shrink-0">{labels.summaryPreGeneratedLabel}</span>
          <span aria-hidden="true" className="shrink-0">·</span>
        </>
      ) : null}
      <span className={cn("inline-flex min-w-0 items-center gap-1", !completed.preGenerated && "max-[340px]:max-w-full max-[340px]:basis-full")}>
        <ModelName>{completed.modelName}</ModelName>
        <ModelExecutionInfo execution={metadata?.modelExecution} />
      </span>
      {!completed.preGenerated ? (
        <>
          <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
            <span aria-hidden="true" className="max-[340px]:hidden">·</span>
            <time dateTime={completed.generatedAtIso} className="tabular-nums">
              {labels.summaryGenerationDateTimeInline.replace("{time}", completed.generatedAtText)}
            </time>
          </span>
          {completed.durationText ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {labels.summaryGenerationDurationLabel} {completed.durationText}
              </span>
            </span>
          ) : null}
        </>
      ) : null}
      {metadata?.modelExecution && modelExecutionFallback(metadata.modelExecution) && (
        <div className="basis-full"><ModelExecutionNotice execution={metadata.modelExecution} /></div>
      )}
    </div>
  )
}
