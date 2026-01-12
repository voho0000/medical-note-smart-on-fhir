"use client"

import { cn } from "@/src/shared/utils/cn.utils"
import { formatDateTime } from "../utils/formatters"
import { useLanguage } from "@/src/application/providers/language.provider"

export type EncounterMedication = {
  id: string
  name: string
  status?: string
  detail?: string
  when?: string
}

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

export function MedicationRow({ medication }: { medication: EncounterMedication }) {
  return (
    <div className="rounded-lg border bg-background p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-foreground">{medication.name}</span>
          {medication.detail && <span className="text-xs text-muted-foreground">{medication.detail}</span>}
        </div>
        <div className="flex flex-col items-end text-right gap-1">
          {medication.when && <span className="text-xs text-muted-foreground">{medication.when}</span>}
          {medication.status && (
            <span className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs capitalize", 
              medication.status === "active" 
                ? "border-sky-200 bg-sky-50 text-sky-700" 
                : "border-muted bg-muted/60 text-muted-foreground"
            )}>
              {medication.status}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function ProcedureRow({ procedure }: { procedure: EncounterProcedure }) {
  const { t, locale } = useLanguage()
  
  return (
    <div className="rounded-lg border bg-background p-3 shadow-sm">
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
          {procedure.performer && <span className="text-xs text-muted-foreground">{t.visitHistory.performer} {procedure.performer}</span>}
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
