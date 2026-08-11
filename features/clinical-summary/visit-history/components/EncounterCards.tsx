"use client"

import { cn } from "@/src/shared/utils/cn.utils"
import { formatDateTime } from "../utils/formatters"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useResourceAnchor } from "@/src/application/hooks/use-resource-anchor.hook"
import type { EncounterDiagnosis } from "../hooks/useEncounterDetails"

export type EncounterProcedure = {
  id: string
  title: string
  status?: string
  performed?: string
  performer?: string
  category?: string
  outcome?: string
  report: string[]
}

export function DiagnosisTag({ diagnosis }: { diagnosis: EncounterDiagnosis }) {
  const statusColorMap: Record<string, string> = {
    active: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300',
    resolved: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
    inactive: 'border-border bg-muted text-muted-foreground',
    remission: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300',
  }
  const statusStyle =
    (diagnosis.clinicalStatus && statusColorMap[diagnosis.clinicalStatus.toLowerCase()]) ||
    'border-muted bg-muted/60 text-muted-foreground'

  return (
    <div className="rounded-lg border bg-background p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-foreground">{diagnosis.title}</span>
          {diagnosis.code && (
            <span className="font-mono text-xs text-muted-foreground">{diagnosis.code}</span>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          {diagnosis.recordedDate && (
            <span className="text-xs text-muted-foreground">{diagnosis.recordedDate.slice(0, 10)}</span>
          )}
          {diagnosis.clinicalStatus && (
            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs capitalize", statusStyle)}>
              {diagnosis.clinicalStatus}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function ProcedureRow({ procedure }: { procedure: EncounterProcedure }) {
  const { t, locale } = useLanguage()
  const anchorRef = useResourceAnchor('Procedure', procedure.id)
  
  return (
    <div ref={anchorRef} className="rounded-lg border bg-background p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-foreground">{procedure.title}</span>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {procedure.category && <span>{procedure.category}</span>}
            {procedure.outcome && (
              <span className="inline-flex items-center gap-1">
                <span className="font-medium text-foreground/80">{t.visitHistory.outcome}</span> {procedure.outcome}
              </span>
            )}
          </div>
          {procedure.report.length > 0 && (
            <div className="text-xs text-muted-foreground">
              {t.visitHistory.reports} {procedure.report.join(", ")}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          {procedure.performed && <span className="text-xs text-muted-foreground">{formatDateTime(procedure.performed, locale)}</span>}
          {/* Procedure.performer.actor is the operating institution (健保存摺
              sends the 醫事機構, never an individual physician), so use the
              facility label — matching the reports 處置 detail. */}
          {procedure.performer && <span className="text-xs text-muted-foreground">{t.procedures.performer} {procedure.performer}</span>}
          {procedure.status && (
            <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs capitalize border-purple-200 bg-purple-50 text-purple-700">
              {procedure.status}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
