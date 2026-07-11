"use client"

import { AlertCircle, Pencil, Sparkles, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MarkdownRenderer } from "@/src/shared/components/MarkdownRenderer"
import { useLanguage } from "@/src/application/providers/language.provider"
import { MAX_SUMMARY_INSIGHT_MODULES } from "@/src/shared/constants/clinical-insights.constants"
import { useClinicalInsightsRuntime } from "@/features/clinical-insights/ClinicalInsightsRuntimeProvider"

interface CustomInsightModulesSectionProps {
  onManage: (panelId?: string) => void
}

export function CustomInsightModulesSection({ onManage }: CustomInsightModulesSectionProps) {
  const { t } = useLanguage()
  const labels = t.medicalSummary
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
          return (
            <article key={panel.id} className="min-w-0 rounded-lg border border-border bg-card px-3 py-2.5">
              <div className="mb-2 flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                    <h4 className="truncate text-[0.8125rem] font-semibold text-foreground" title={panel.title}>{panel.title}</h4>
                    {panel.autoGenerate ? (
                      <span className="rounded bg-muted px-1 py-0.5 text-[0.5625rem] font-medium text-muted-foreground">
                        {labels.customAutoBadge}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[0.625rem] text-amber-700 dark:text-amber-400">{labels.customNoCitations}</p>
                </div>
                <div className="flex w-full items-center justify-end gap-1.5 sm:w-auto">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 gap-1 px-2 text-[0.6875rem]"
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
                      className="h-7 shrink-0 gap-1 px-2 text-[0.6875rem]"
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
                      className="h-7 shrink-0 gap-1 px-2 text-[0.6875rem]"
                      disabled={!canGenerate || !hasData}
                      onClick={() => void runPanel(panel.id, { force: true })}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {hasResponse ? labels.customRegenerate : labels.customGenerate}
                    </Button>
                  )}
                </div>
              </div>

              {status.error ? (
                <div className="flex items-start gap-1.5 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{status.error.message}</span>
                </div>
              ) : status.isLoading && !hasResponse ? (
                <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 animate-pulse text-violet-500" />
                  {labels.customGenerating}
                </div>
              ) : hasResponse ? (
                <div className="text-[0.8125rem] leading-snug text-foreground">
                  <MarkdownRenderer content={response.text} />
                </div>
              ) : (
                <p className="line-clamp-3 text-xs leading-snug text-muted-foreground">{panel.prompt}</p>
              )}
            </article>
          )
        })}
      </div>
      )}
    </section>
  )
}
