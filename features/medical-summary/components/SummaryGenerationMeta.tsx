"use client"

import { useEffect, useState } from "react"
import { Cpu, Loader2 } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/src/shared/utils/cn.utils"
import {
  formatGenerationDuration,
  type MedicalSummaryGenerationInfo,
} from "../utils/summary-generation-info"

export interface ActiveSummaryGeneration {
  id: string
  modelName: string
  startedAt: number
}

interface SummaryGenerationMetaProps {
  generationInfo?: MedicalSummaryGenerationInfo
  activeGeneration?: ActiveSummaryGeneration | null
  runningLabel: string
  runningAriaTemplate: string
  className?: string
}

function TruncatedModelName({ modelName }: { modelName: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="min-w-0 max-w-[7rem] cursor-help truncate focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          tabIndex={0}
        >
          {modelName}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={4}
        className="max-w-[min(90vw,32rem)] whitespace-normal break-all text-left text-xs"
      >
        {modelName}
      </TooltipContent>
    </Tooltip>
  )
}

function RunningGenerationMeta({
  activeGeneration,
  runningLabel,
  runningAriaTemplate,
  className,
}: {
  activeGeneration: ActiveSummaryGeneration
  runningLabel: string
  runningAriaTemplate: string
  className?: string
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const elapsedText = formatGenerationDuration(
    Math.max(0, now - activeGeneration.startedAt),
  ) ?? "00:00"
  const ariaLabel = runningAriaTemplate
    .replace("{model}", activeGeneration.modelName)
    .replace("{elapsed}", elapsedText)

  return (
    <div
      data-testid="medical-summary-generation-meta"
      className={cn(
        "flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap text-muted-foreground/80",
        className,
      )}
      role="timer"
      aria-live="off"
      aria-label={ariaLabel}
    >
      <Loader2 aria-hidden="true" className="h-3 w-3 shrink-0 animate-spin text-teal-600" />
      <span className="shrink-0 font-medium text-teal-700 dark:text-teal-300">
        {runningLabel}
      </span>
      <span aria-hidden="true" className="shrink-0">·</span>
      <TruncatedModelName modelName={activeGeneration.modelName} />
      <span aria-hidden="true" className="shrink-0">·</span>
      <span className="shrink-0 tabular-nums">{elapsedText}</span>
    </div>
  )
}

export function SummaryGenerationMeta({
  generationInfo,
  activeGeneration,
  runningLabel,
  runningAriaTemplate,
  className,
}: SummaryGenerationMetaProps) {
  if (activeGeneration) {
    return (
      <RunningGenerationMeta
        key={activeGeneration.id}
        activeGeneration={activeGeneration}
        runningLabel={runningLabel}
        runningAriaTemplate={runningAriaTemplate}
        className={className}
      />
    )
  }
  if (!generationInfo) return null

  return (
    <div
      data-testid="medical-summary-generation-meta"
      className={cn(
        "flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap text-muted-foreground/80",
        className,
      )}
      aria-label={generationInfo.ariaLabel}
    >
      <Cpu aria-hidden="true" className="h-3 w-3 shrink-0" />
      {generationInfo.prefix ? (
        <>
          <span className="shrink-0">{generationInfo.prefix}</span>
          <span aria-hidden="true" className="shrink-0">·</span>
        </>
      ) : null}
      <TruncatedModelName modelName={generationInfo.modelName} />
      {generationInfo.generatedAtIso && generationInfo.generatedAtText ? (
        <>
          <span aria-hidden="true" className="shrink-0">·</span>
          <time
            className="shrink-0 tabular-nums"
            dateTime={generationInfo.generatedAtIso}
          >
            {generationInfo.generatedAtText}
          </time>
        </>
      ) : null}
      {generationInfo.durationLabel && generationInfo.durationText ? (
        <>
          <span aria-hidden="true" className="shrink-0">·</span>
          <span className="shrink-0">
            {generationInfo.durationLabel} {generationInfo.durationText}
          </span>
        </>
      ) : null}
    </div>
  )
}
