"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useDataSelection } from "@/src/application/providers/data-selection.provider"
import { dataCategoryRegistry } from "@/src/core/registry/data-category.registry"
import { CategoryFilterControls } from "./CategoryFilterControls"
import { DocumentChecklist } from "./DocumentChecklist"
import type { PresetId } from "@/src/shared/constants/data-selection.constants"
import type { DataItem, DataType } from "../hooks/useDataCategories"
import type { DataSelection, DataFilters } from "@/src/core/entities/clinical-context.entity"
import type { ClinicalDataCollection } from "@/src/core/entities/clinical-data.entity"
import type { FilterValue } from "@/src/core/interfaces/data-category.interface"

interface DataSelectionTabProps {
  clinicalData: ClinicalDataCollection
  dataCategories: DataItem[]
  selectedData: DataSelection
  filters: DataFilters
  onToggle: (id: DataType, checked: boolean) => void
  onToggleAll: (checked: boolean) => void
  onFilterChange: (key: keyof DataFilters, value: FilterValue) => void
  allSelected: boolean
  someSelected: boolean
}

// Sections mirror the LEFT-panel tabs so what you toggle here maps 1:1 to what
// the clinician sees on the left.
const GROUPS: Array<{ id: string; labelKey: string; fallback: string }> = [
  { id: 'patient', labelKey: 'patient', fallback: 'Patient' },
  { id: 'visit', labelKey: 'visits', fallback: 'Visits' },
  { id: 'reports', labelKey: 'reports', fallback: 'Reports' },
  { id: 'medication', labelKey: 'medications', fallback: 'Medications' },
  { id: 'documents', labelKey: 'documents', fallback: 'Documents' },
]
const DEFAULT_OPEN = new Set(['patient', 'visit', 'reports', 'medication', 'documents'])

// Active segment in the 編輯對象 / 情境 pill toggles — light amber to match the
// data-selection tab accent (so the selected option reads as selected, not just
// a white gap).
const ACTIVE_SEGMENT = 'bg-amber-100 text-amber-700 shadow-sm dark:bg-amber-500/20 dark:text-amber-300'

export function DataSelectionTab({
  clinicalData,
  dataCategories,
  selectedData,
  filters,
  onToggle,
  onToggleAll,
  onFilterChange,
  allSelected,
}: DataSelectionTabProps) {
  const { t } = useLanguage()
  const {
    applyPreset,
    activePreset,
    resetToDefaults,
    setEditedClinicalContext,
    editingConsumer,
    setEditingConsumer,
    syncEditingToAll,
    allConsumersInSync,
  } = useDataSelection()
  const [mounted, setMounted] = useState(false)
  const [openGroups, setOpenGroups] = useState<Set<string>>(DEFAULT_OPEN)

  useEffect(() => setMounted(true), [])

  const grouped = useMemo(() => {
    const map = new Map<string, DataItem[]>()
    GROUPS.forEach((g) => map.set(g.id, []))
    dataCategories.forEach((item) => map.get(item.category || '')?.push(item))
    return map
  }, [dataCategories])

  if (!mounted) return null

  const groupTitles = (t.dataSelection as unknown as { groups?: Record<string, string> }).groups ?? {}
  const ds = t.dataSelection as unknown as Record<string, string>
  const adaptedFilters = filters as unknown as Record<string, FilterValue>

  const handleApplyPreset = (presetId: PresetId) => {
    applyPreset(presetId)
    setEditedClinicalContext(null)
  }

  const CONSUMER_LABELS: Record<'chat' | 'insights' | 'ips', string> = {
    chat: ds.consumerChat ?? '對話',
    insights: ds.consumerInsights ?? '洞察',
    ips: ds.consumerIps ?? 'IPS',
  }

  return (
    <div className="space-y-3">
      {/* Which consumer you're editing (對話 / 洞察 / IPS) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{ds.editConsumer ?? '編輯對象'}</span>
          <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
            {(['chat', 'insights', 'ips'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setEditingConsumer(c)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  editingConsumer === c
                    ? ACTIVE_SEGMENT
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {CONSUMER_LABELS[c]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[0.6875rem] ${allConsumersInSync ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400'}`}>
            {allConsumersInSync ? ds.inSync : ds.customized}
          </span>
          {!allConsumersInSync && (
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={syncEditingToAll}>
              {ds.syncToAll}
            </Button>
          )}
        </div>
      </div>

      {/* Scenario presets + bulk actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{ds.preset ?? '情境'}</span>
          <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
            {([
              { id: 'general', label: ds.presetGeneral ?? '通用' },
              { id: 'newPatient', label: ds.presetNewPatient ?? '初診' },
              { id: 'followUp', label: ds.presetFollowUp ?? '追蹤' },
            ] as const).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleApplyPreset(id)}
                aria-pressed={activePreset === id}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                  activePreset === id
                    ? ACTIVE_SEGMENT
                    : 'text-muted-foreground hover:bg-background hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => onToggleAll(!allSelected)}>
            {allSelected ? ds.deselectAll : ds.selectAll}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              resetToDefaults()
              setEditedClinicalContext(null)
            }}
          >
            {ds.resetToDefault}
          </Button>
        </div>
      </div>

      {/* Accordion sections — one per left-panel tab */}
      <div className="space-y-2">
        {GROUPS.map((group) => {
          const items = grouped.get(group.id) || []
          if (items.length === 0) return null
          const selectedCount = items.filter((i) => selectedData[i.id]).length
          const open = openGroups.has(group.id)
          return (
            <Collapsible
              key={group.id}
              open={open}
              onOpenChange={() =>
                setOpenGroups((prev) => {
                  const next = new Set(prev)
                  if (next.has(group.id)) next.delete(group.id)
                  else next.add(group.id)
                  return next
                })
              }
              className="overflow-hidden rounded-md border bg-background"
            >
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 bg-muted/30 px-3 py-2 text-left hover:bg-muted/50">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
                  {groupTitles[group.labelKey] ?? group.fallback}
                </span>
                <span className="text-[0.6875rem] text-muted-foreground">
                  {selectedCount} / {items.length} {ds.selectedCountLabel ?? ''}
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-3 py-1">
                {items.map((item, idx) => {
                  const isSelected = !!selectedData[item.id]
                  const category = dataCategoryRegistry.get(item.id)
                  const hasFilters = isSelected && (category?.filters?.length ?? 0) > 0
                  return (
                    <div
                      key={item.id}
                      className={idx < items.length - 1 ? 'border-b border-border/40 py-2' : 'py-2'}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Switch
                            checked={isSelected}
                            onCheckedChange={(c) => onToggle(item.id, c)}
                            className="scale-90 shrink-0"
                            aria-label={item.label}
                          />
                          <span className={`truncate text-sm ${isSelected ? '' : 'text-muted-foreground'}`} title={item.description}>
                            {item.label}
                          </span>
                        </div>
                        {/* Filters share the item's row (saves a line per filtered item) */}
                        <div className="flex shrink-0 items-center gap-2">
                          {hasFilters && category && (
                            <CategoryFilterControls
                              category={category}
                              filters={adaptedFilters}
                              onFilterChange={(key, value) => onFilterChange(key as keyof DataFilters, value)}
                            />
                          )}
                          {/* Always show the count, including 0 (so "no data" is explicit) */}
                          <span className="text-[0.6875rem] tabular-nums text-muted-foreground">{item.count}</span>
                        </div>
                      </div>
                      {item.id === 'documents' && isSelected && (
                        <div className="mt-2 pl-9">
                          <DocumentChecklist clinicalData={clinicalData} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </CollapsibleContent>
            </Collapsible>
          )
        })}
      </div>
    </div>
  )
}
