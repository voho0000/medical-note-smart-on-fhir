"use client"

import { Button } from "@/components/ui/button"
import { DataCategoryItem } from "./DataCategoryItem"
import { MedicationFilter, VitalSignsFilter, LabReportFilter } from "./DataFilters"
import type { DataItem, DataType } from "../hooks/useDataCategories"
import type { DataSelection, DataFilters } from "@/src/core/entities/clinical-context.entity"

interface DataSelectionTabProps {
  dataCategories: DataItem[]
  selectedData: DataSelection
  filters: DataFilters
  onToggle: (id: DataType, checked: boolean) => void
  onToggleAll: (checked: boolean) => void
  onFilterChange: (key: keyof DataFilters, value: any) => void
  allSelected: boolean
  someSelected: boolean
}

export function DataSelectionTab({
  dataCategories,
  selectedData,
  filters,
  onToggle,
  onToggleAll,
  onFilterChange,
  allSelected,
  someSelected,
}: DataSelectionTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-medium">Data Categories</h2>
          <p className="text-sm text-muted-foreground">
            Select which data categories to include in your notes
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => onToggleAll(!allSelected)}
          >
            {allSelected ? 'Deselect All' : someSelected ? 'Select All' : 'Select All'}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {dataCategories.map((item) => (
          <DataCategoryItem
            key={item.id}
            item={item}
            isSelected={!!selectedData[item.id]}
            onToggle={onToggle}
            renderFilters={() => {
              if (item.id === 'medications' && selectedData.medications) {
                return <MedicationFilter filters={filters} onFilterChange={onFilterChange} />
              }
              if (item.id === 'observations' && selectedData.observations) {
                return <VitalSignsFilter filters={filters} onFilterChange={onFilterChange} />
              }
              if (item.id === 'diagnosticReports' && selectedData.diagnosticReports) {
                return <LabReportFilter filters={filters} onFilterChange={onFilterChange} />
              }
              return null
            }}
          />
        ))}
      </div>
    </div>
  )
}
