"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useDataSelection } from "@/src/application/providers/data-selection.provider"
import { DataCategoryItem } from "./DataCategoryItem"
import { getFilterComponent } from "./filter-registry"
import { dataCategoryRegistry } from "@/src/core/registry/data-category.registry"
import type { DataItem, DataType } from "../hooks/useDataCategories"
import type { DataSelection, DataFilters } from "@/src/core/entities/clinical-context.entity"
import type { FilterValue } from "@/src/core/interfaces/data-category.interface"

interface CategoryListProps {
  dataCategories: DataItem[]
}

interface SelectionProps {
  selectedData: DataSelection
  onToggle: (id: DataType, checked: boolean) => void
}

interface FilteringProps {
  filters: DataFilters
  onFilterChange: (key: keyof DataFilters, value: FilterValue) => void
}

interface BulkSelectionProps {
  onToggleAll: (checked: boolean) => void
  allSelected: boolean
  someSelected: boolean
}

interface DataSelectionTabProps
  extends CategoryListProps,
          SelectionProps,
          FilteringProps,
          BulkSelectionProps {}

// Display order for the 4 left-panel-aligned groups.
const GROUPS: Array<{ id: string; labelKey: string; fallback: string }> = [
  { id: 'patient',    labelKey: 'patient',     fallback: 'Patient' },
  { id: 'visit',      labelKey: 'visits',      fallback: 'Visits' },
  { id: 'reports',    labelKey: 'reports',     fallback: 'Reports' },
  { id: 'medication', labelKey: 'medications', fallback: 'Medications' },
]

export function DataSelectionTab(props: DataSelectionTabProps) {
  const {
    dataCategories,
    selectedData,
    filters,
    onToggle,
    onToggleAll,
    onFilterChange,
    allSelected,
  } = props
  const { t } = useLanguage()
  const { resetToDefaults, setEditedClinicalContext } = useDataSelection()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const groupedCategories = useMemo(() => {
    const map = new Map<string, DataItem[]>()
    GROUPS.forEach((g) => map.set(g.id, []))
    const unknown: DataItem[] = []
    dataCategories.forEach((item) => {
      const groupId = item.category || 'unknown'
      const bucket = map.get(groupId)
      if (bucket) {
        bucket.push(item)
      } else {
        unknown.push(item)
      }
    })
    return { map, unknown }
  }, [dataCategories])

  if (!mounted) {
    return null
  }

  const groupTitles = (t.dataSelection as any).groups ?? {}

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-medium">{t.dataSelection.dataCategories}</h2>
          <p className="text-sm text-muted-foreground">
            {t.dataSelection.dataCategoriesDescription}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onToggleAll(!allSelected)}
          >
            {mounted && allSelected ? t.dataSelection.deselectAll : t.dataSelection.selectAll}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              resetToDefaults()
              // Also clear the cached Preview edit so the fresh defaults
              // actually surface in the textarea.
              setEditedClinicalContext(null)
            }}
          >
            {t.dataSelection.resetToDefault}
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {GROUPS.map((group) => {
          const items = groupedCategories.map.get(group.id) || []
          if (items.length === 0) return null
          const title = groupTitles[group.labelKey] ?? group.fallback
          return (
            <div key={group.id} className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {title}
              </h3>
              <div className="space-y-3">
                {items.map((item) => {
                  const category = dataCategoryRegistry.get(item.id)
                  const FilterComponent = getFilterComponent(category?.filterComponentKey)
                  const adaptedFilters = filters as unknown as Record<string, FilterValue>
                  const adaptedOnFilterChange = (key: string, value: FilterValue) => {
                    onFilterChange(key as keyof DataFilters, value)
                  }
                  return (
                    <DataCategoryItem
                      key={item.id}
                      item={item}
                      isSelected={!!selectedData[item.id]}
                      onToggle={onToggle}
                      FilterComponent={FilterComponent}
                      filterProps={{
                        filters: adaptedFilters,
                        onFilterChange: adaptedOnFilterChange
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}

        {groupedCategories.unknown.length > 0 && (
          <div className="space-y-3">
            {groupedCategories.unknown.map((item) => {
              const category = dataCategoryRegistry.get(item.id)
              const FilterComponent = getFilterComponent(category?.filterComponentKey)
              const adaptedFilters = filters as unknown as Record<string, FilterValue>
              const adaptedOnFilterChange = (key: string, value: FilterValue) => {
                onFilterChange(key as keyof DataFilters, value)
              }
              return (
                <DataCategoryItem
                  key={item.id}
                  item={item}
                  isSelected={!!selectedData[item.id]}
                  onToggle={onToggle}
                  FilterComponent={FilterComponent}
                  filterProps={{
                    filters: adaptedFilters,
                    onFilterChange: adaptedOnFilterChange
                  }}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
