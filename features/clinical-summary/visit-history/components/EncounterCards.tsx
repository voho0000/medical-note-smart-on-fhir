"use client"

import { cn } from "@/src/shared/utils/cn.utils"
import { formatDateTime } from "../utils/formatters"
import { useLanguage } from "@/src/application/providers/language.provider"
import type { EncounterDiagnosis } from "../hooks/useEncounterDetails"

export type EncounterMedication = {
  id: string
  name: string
  status?: string
  detail?: string
  when?: string
  isChronic?: boolean
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
  const { t } = useLanguage()
  const mt = (t.medications as any)
  // Single-row, low-padding layout — sized to match the 用藥 tab's
  // MedicationItem (px-2.5 py-1, 13px title, [10px] badges) so a med reads the
  // same whether seen here or in the dedicated tab. The per-med date is
  // intentionally dropped — every med in an encounter shares the encounter's
  // date (already shown in the visit header) and the bridge's time is always
  // midnight, so it was pure redundancy. name + 慢箋 + dosing detail flow on the
  // left (wrapping only on very narrow panels); status stays pinned right.
  return (
    <div className="rounded-md border bg-background px-2.5 py-1 leading-tight">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-x-1.5 gap-y-0.5 flex-wrap min-w-0">
          <span className="text-[13px] font-semibold text-foreground">{medication.name}</span>
          {medication.isChronic && (
            <span
              title={mt.chronicTooltip ?? 'Continuous long term therapy'}
              className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0 text-[10px] font-medium text-violet-700"
            >
              {mt.chronic ?? '慢箋'}
            </span>
          )}
          {medication.detail && <span className="text-[10px] text-muted-foreground">{medication.detail}</span>}
        </div>
        {medication.status && (
          <span className={cn(
            "shrink-0 inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] capitalize",
            medication.status === "active"
              ? "border-sky-200 bg-sky-50 text-sky-700"
              : "border-muted bg-muted/60 text-muted-foreground"
          )}>
            {medication.status}
          </span>
        )}
      </div>
    </div>
  )
}

export function DiagnosisTag({ diagnosis }: { diagnosis: EncounterDiagnosis }) {
  const statusColorMap: Record<string, string> = {
    active: 'border-rose-200 bg-rose-50 text-rose-700',
    resolved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    inactive: 'border-gray-200 bg-gray-50 text-gray-600',
    remission: 'border-sky-200 bg-sky-50 text-sky-700',
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
