"use client"

import { useMemo } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useClinicalContext } from "@/src/application/hooks/use-clinical-context.hook"
import { useDataFiltering } from "../hooks/useDataFiltering"
import { useDataCategories, type DataType } from "../hooks/useDataCategories"
import { DataSelectionTab } from "./DataSelectionTab"
import { PreviewTab } from "./PreviewTab"
import type { DataSelection, DataFilters } from "@/src/core/entities/clinical-context.entity"

type ClinicalData = {
  conditions: any[]
  medications: any[]
  allergies: any[]
  diagnosticReports: any[]
  procedures: any[]
  observations: any[]
}

interface DataSelectionPanelProps {
  clinicalData: ClinicalData
  selectedData: DataSelection
  filters: DataFilters
  onSelectionChange: (selectedData: DataSelection) => void
  onFiltersChange: (filters: DataFilters) => void
}

export function DataSelectionPanel({ 
  clinicalData, 
  selectedData,
  filters,
  onSelectionChange,
  onFiltersChange 
}: DataSelectionPanelProps) {
  const { t } = useLanguage()
  const { 
    getFormattedClinicalContext, 
    supplementaryNotes, 
    setSupplementaryNotes,
    editedClinicalContext,
    setEditedClinicalContext,
    resetClinicalContextToDefault
  } = useClinicalContext()

  const { filterKey, getFilteredCount, handleFilterChange } = useDataFiltering(filters, onFiltersChange)
  const dataCategories = useDataCategories(clinicalData, getFilteredCount, filterKey)

  const handleToggle = (id: DataType, checked: boolean) => {
    onSelectionChange({
      ...selectedData,
      [id]: checked
    } as DataSelection)
  }

  const handleToggleAll = (checked: boolean) => {
    const newSelection = { ...selectedData } as DataSelection
    dataCategories.forEach(item => {
      newSelection[item.id] = checked
    })
    onSelectionChange(newSelection)
  }

  const allSelected = useMemo(() => 
    dataCategories.every(item => selectedData[item.id]), 
    [dataCategories, selectedData]
  )
  
  const someSelected = useMemo(() => 
    dataCategories.some(item => selectedData[item.id]) && !allSelected,
    [dataCategories, selectedData, allSelected]
  )

  return (
    <Tabs defaultValue="selection" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="selection">{t.dataSelection.title}</TabsTrigger>
        <TabsTrigger value="preview">{t.common.preview}</TabsTrigger>
      </TabsList>
      <TabsContent value="selection" className="mt-6">
        <DataSelectionTab
          dataCategories={dataCategories}
          selectedData={selectedData}
          filters={filters}
          onToggle={handleToggle}
          onToggleAll={handleToggleAll}
          onFilterChange={handleFilterChange}
          allSelected={allSelected}
          someSelected={someSelected}
        />
      </TabsContent>
      <TabsContent value="preview" className="mt-6">
        <PreviewTab
          supplementaryNotes={supplementaryNotes}
          onSupplementaryNotesChange={setSupplementaryNotes}
          editedClinicalContext={editedClinicalContext}
          onEditedClinicalContextChange={setEditedClinicalContext}
          formattedClinicalContext={getFormattedClinicalContext()}
          onReset={resetClinicalContextToDefault}
        />
      </TabsContent>
    </Tabs>
  )
}
