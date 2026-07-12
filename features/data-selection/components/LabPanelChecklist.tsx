"use client"

// Per-panel picker for the 檢驗 category. For analyte-dense patients (an ICU or
// oncology case can carry 150+ distinct analytes) the full lab set can dominate
// the AI context; this lets the user keep only the clinically relevant panels
// (e.g. CBC + renal). No chips ticked = every panel included (the default), so
// the common case needs zero interaction.
import { useMemo } from "react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { categorizeObservation } from "@/src/shared/utils/lab-categories"
import type { ClinicalDataCollection } from "@/src/core/entities/clinical-data.entity"
import type { DataFilters } from "@/src/core/entities/clinical-context.entity"
import type { FilterValue } from "@/src/core/interfaces/data-category.interface"

interface LabPanelChecklistProps {
  clinicalData: ClinicalDataCollection
  filters: DataFilters
  onFilterChange: (key: keyof DataFilters, value: FilterValue) => void
}

export function LabPanelChecklist({ clinicalData, filters, onFilterChange }: LabPanelChecklistProps) {
  const { t } = useLanguage()
  const ds = t.dataSelection as unknown as Record<string, string>
  const catLabels = (t.reports as unknown as { cumulativeCategories?: Record<string, string> })
    .cumulativeCategories ?? {}

  // Panels that actually have data for this patient, with a distinct-analyte
  // count each. Derived from every observation (categorizeObservation only
  // matches lab analytes, so vitals fall out as null).
  const panels = useMemo(() => {
    const byPanel = new Map<string, Set<string>>()
    for (const obs of (clinicalData?.observations ?? []) as any[]) {
      const cat = categorizeObservation(obs)
      if (!cat) continue
      const name = obs?.code?.text || obs?.code?.coding?.[0]?.display || 'Lab'
      if (!byPanel.has(cat.id)) byPanel.set(cat.id, new Set())
      byPanel.get(cat.id)!.add(name)
    }
    return [...byPanel.entries()]
      .map(([id, names]) => ({ id, count: names.size }))
      .sort((a, b) => b.count - a.count)
  }, [clinicalData])

  const selected = useMemo(() => {
    const csv = String(filters.labPanelIds ?? '')
    return new Set(csv.split(',').map((s) => s.trim()).filter(Boolean))
  }, [filters.labPanelIds])

  if (panels.length <= 1) return null // nothing to narrow

  const commit = (next: Set<string>) => {
    onFilterChange('labPanelIds', [...next].join(','))
  }
  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    commit(next)
  }
  const allActive = selected.size === 0

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => commit(new Set())}
          aria-pressed={allActive}
          className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-medium transition-colors ${
            allActive
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
              : 'border border-border/70 text-muted-foreground hover:text-foreground'
          }`}
        >
          {ds.labPanelAll ?? '全部項目'}
        </button>
        {panels.map((p) => {
          const on = selected.has(p.id)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              aria-pressed={on}
              className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-medium transition-colors ${
                on
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                  : 'border border-border/70 text-muted-foreground hover:text-foreground'
              }`}
            >
              {catLabels[p.id] ?? p.id} <span className="tabular-nums opacity-70">{p.count}</span>
            </button>
          )
        })}
      </div>
      {!allActive && (
        <p className="text-[0.625rem] text-muted-foreground">
          {ds.labPanelHint ?? '僅納入選取的檢驗分類;不選＝全部'}
        </p>
      )}
    </div>
  )
}
