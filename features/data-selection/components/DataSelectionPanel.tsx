"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useClinicalContext } from "@/src/application/hooks/use-clinical-context.hook"
import { useDataFiltering } from "../hooks/useDataFiltering"
import { useDataCategories } from "../hooks/useDataCategories"
import { useSelectionLogic } from "../hooks/useSelectionLogic"
import { DataSelectionTab } from "./DataSelectionTab"
import { PreviewTab } from "./PreviewTab"
import type { DataSelection, DataFilters } from "@/src/core/entities/clinical-context.entity"
import type { ClinicalDataCollection } from "@/src/core/entities/clinical-data.entity"

interface DataSelectionPanelProps {
  clinicalData: ClinicalDataCollection
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

  const { filterKey, handleFilterChange } = useDataFiltering(filters, onFiltersChange)
  const dataCategories = useDataCategories(clinicalData, filterKey, filters)

  // Use selection logic hook (Single Responsibility Principle)
  const { handleToggle, handleToggleAll, allSelected, someSelected } = useSelectionLogic({
    selectedData,
    dataCategories,
    onSelectionChange
  })

  return (
    <Tabs defaultValue="selection" className="w-full space-y-4">
      <TabsList className="grid w-full grid-cols-2 gap-1 h-9 bg-muted/40 p-1 border border-border/50">
        <TabsTrigger value="selection" className="text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">{t.dataSelection.title}</TabsTrigger>
        <TabsTrigger value="preview" className="text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">{t.common.preview}</TabsTrigger>
      </TabsList>
      <TabsContent value="selection">
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
      <TabsContent value="preview">
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
