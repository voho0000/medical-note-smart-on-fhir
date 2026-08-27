"use client"

import { useState } from "react"
import { AlertCircle, ChevronDown, ChevronUp, Pencil, Sparkles, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { MarkdownRenderer } from "@/src/shared/components/MarkdownRenderer"
import { useLanguage } from "@/src/application/providers/language.provider"
import { MAX_SUMMARY_INSIGHT_MODULES } from "@/src/shared/constants/clinical-insights.constants"
import { cn } from "@/src/shared/utils/cn.utils"
import { markdownToPlainText } from "@/src/shared/utils/markdown-to-text"
import { useClinicalInsightsRuntime } from "@/features/clinical-insights/ClinicalInsightsRuntimeProvider"
import { CustomInsightGenerationMeta } from "./CustomInsightGenerationMeta"

interface CustomInsightModulesSectionProps {
  onManage: (panelId?: string) => void
}

export function CustomInsightModulesSection({ onManage }: CustomInsightModulesSectionProps) {
  const { t } = useLanguage()
  const labels = t.medicalSummary
  const [collapsedPanelIds, setCollapsedPanelIds] = useState<Set<string>>(() => new Set())
  const {
    panels,
    canGenerate,
    hasData,
    responses,
    panelStatus,
    runPanel,
    stopPanel,
  } = useClinicalInsightsRuntime()

  const visiblePanels = panels
    .filter((panel) => panel.showInSummary)
    .slice(0, MAX_SUMMARY_INSIGHT_MODULES)

  return (
    <section className="space-y-2" aria-label={labels.customSummaryTab}>
      {visiblePanels.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-3 py-8 text-center">
          <p className="text-sm font-medium text-foreground">{labels.customInsightsEmpty}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visiblePanels.map((panel) => {
            const response = responses[panel.id]
            const status = panelStatus[panel.id] ?? { isLoading: false, error: null }
            const hasResponse = Boolean(response?.text?.trim())
            const isCollapsed = collapsedPanelIds.has(panel.id)
            const canToggleResult = hasResponse && !status.error
            const collapsedPreview = isCollapsed && hasResponse
              ? markdownToPlainText(response?.text ?? "").replace(/\s+/g, " ")
              : null
            const toggleResultLabel = (
              isCollapsed ? labels.customExpandResult : labels.customCollapseResult
            ).replace("{title}", panel.title)
            return (
              <Collapsible
                key={panel.id}
                open={!isCollapsed}
                onOpenChange={(open) => {
                  setCollapsedPanelIds((current) => {
                    const next = new Set(current)
                    if (open) next.delete(panel.id)
                    else next.add(panel.id)
                    return next
                  })
                }}
                asChild
              >
                <article className="min-w-0 rounded-lg border border-border bg-card px-3 py-2.5">
                  <div className="mb-2">
                    <div className="relative">
                      {canToggleResult ? (
                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            className="absolute inset-0 z-0 rounded-md bg-accent/60 text-left transition-colors hover:bg-accent/90 focus-visible:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
                            aria-label={toggleResultLabel}
                            title={toggleResultLabel}
                            data-testid={`custom-insight-toggle-${panel.id}`}
                          >
                            <span className="sr-only">{toggleResultLabel}</span>
                          </button>
                        </CollapsibleTrigger>
                      ) : null}
                      <div
                        className={cn(
                          "relative z-10 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1.5 gap-y-1 @min-[38rem]:grid-cols-[auto_minmax(0,1fr)_auto] @min-[38rem]:gap-x-2",
                          canToggleResult && "pointer-events-none",
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-1.5 @min-[38rem]:max-w-56">
                          <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-500 dark:text-violet-300" />
                          <h4
                            className="min-w-0 truncate text-[0.8125rem] font-semibold text-foreground"
                            title={panel.title}
                          >
                            {panel.title}
                          </h4>
                          {panel.autoGenerate ? (
                            <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[0.625rem] font-medium text-muted-foreground">
                              {labels.customAutoBadge}
                            </span>
                          ) : null}
                        </div>

                        <CustomInsightGenerationMeta
                          metadata={response?.metadata}
                          activeGeneration={status.isLoading ? status.activeGeneration : undefined}
                          className="pointer-events-auto col-span-2 row-start-2 min-w-0 @min-[38rem]:col-span-1 @min-[38rem]:col-start-2 @min-[38rem]:row-start-1 @min-[38rem]:justify-self-end"
                        />

                        <div className="col-start-2 row-start-1 flex items-center justify-end gap-1 @min-[38rem]:col-start-3">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="pointer-events-auto h-11 shrink-0 gap-1 px-1.5 text-xs sm:h-7 sm:px-2"
                            onClick={() => onManage(panel.id)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            {labels.editCustomInsight}
                          </Button>
                          {status.isLoading ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="pointer-events-auto h-11 shrink-0 gap-1 px-1.5 text-xs sm:h-7 sm:px-2"
                              onClick={() => stopPanel(panel.id)}
                            >
                              <Square className="h-3.5 w-3.5 fill-current" />
                              {t.common.stop}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="pointer-events-auto h-11 shrink-0 gap-1 px-1.5 text-xs sm:h-7 sm:px-2"
                              disabled={!canGenerate || !hasData}
                              onClick={() => void runPanel(panel.id, { force: true })}
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                              {hasResponse ? labels.customRegenerate : labels.customGenerate}
                            </Button>
                          )}
                          {canToggleResult ? (
                            <span
                              aria-hidden="true"
                              className="flex h-11 w-11 items-center justify-center text-accent-foreground sm:h-7 sm:w-7"
                            >
                              {isCollapsed ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronUp className="h-3.5 w-3.5" />
                              )}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{labels.customNoCitations}</p>
                  </div>

                  {status.error ? (
                    <div className="flex items-start gap-1.5 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:bg-rose-500/10 dark:text-rose-300">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{status.error.message}</span>
                    </div>
                  ) : status.isLoading && !hasResponse ? (
                    <div
                      className="py-3 text-xs text-muted-foreground"
                      role="status"
                      aria-live="polite"
                    >
                      {labels.customGenerating}
                    </div>
                  ) : hasResponse ? (
                    <>
                      {collapsedPreview ? (
                        <p
                          className="line-clamp-3 text-[0.8125rem] leading-snug text-foreground/75"
                          data-testid={`custom-insight-preview-${panel.id}`}
                        >
                          {collapsedPreview}
                        </p>
                      ) : null}
                      <CollapsibleContent id={`custom-insight-result-${panel.id}`}>
                        <div className="text-[0.8125rem] leading-snug text-foreground">
                          <MarkdownRenderer content={response.text} />
                        </div>
                      </CollapsibleContent>
                    </>
                  ) : (
                    <p className="line-clamp-3 text-xs leading-snug text-muted-foreground">{panel.prompt}</p>
                  )}
                </article>
              </Collapsible>
            )
          })}
        </div>
      )}
    </section>
  )
}
