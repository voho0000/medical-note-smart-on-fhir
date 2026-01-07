"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/src/application/providers/language.provider"
import { DataCategoryItem } from "./DataCategoryItem"
import { dataCategoryRegistry } from "@/src/core/registry/data-category.registry"
import type { DataItem, DataType } from "../hooks/useDataCategories"
import type { DataSelection, DataFilters } from "@/src/core/entities/clinical-context.entity"
import type { FilterValue } from "@/src/core/interfaces/data-category.interface"

// Separated interfaces following Interface Segregation Principle
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

// Combined interface for the component
interface DataSelectionTabProps 
  extends CategoryListProps, 
          SelectionProps, 
          FilteringProps, 
          BulkSelectionProps {}

export function DataSelectionTab(props: DataSelectionTabProps) {
  const {
    dataCategories,
    selectedData,
    filters,
    onToggle,
    onToggleAll,
    onFilterChange,
    allSelected,
    someSelected,
  } = props
  const { t } = useLanguage()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

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
        </div>
      </div>

      <div className="space-y-3">
        {dataCategories.map((item) => {
          // Get the category from registry
          const category = dataCategoryRegistry.get(item.id)
          const FilterComponent = category?.FilterComponent
          
          // Type adapter: convert DataFilters to Record<string, FilterValue>
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
}
