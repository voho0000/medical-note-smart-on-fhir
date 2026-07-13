"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TAB_ACTIVE_CLASSES } from "@/src/shared/config/ui-theme.config"
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
  modelId?: string
  fallbackModelId?: string
  showScopeDescription?: boolean
}

export function DataSelectionPanel({ 
  clinicalData, 
  selectedData,
  filters,
  onSelectionChange,
  onFiltersChange,
  modelId,
  fallbackModelId,
  showScopeDescription = true,
}: DataSelectionPanelProps) {
  const { t } = useLanguage()
  const { getFormattedClinicalContext } = useClinicalContext()
  const [activeTab, setActiveTab] = useState('selection')
  const { filterKey, handleFilterChange } = useDataFiltering(filters, onFiltersChange)
  const dataCategories = useDataCategories(clinicalData, filterKey, filters)

  // Use selection logic hook (Single Responsibility Principle)
  const { handleToggle, handleToggleAll, allSelected, someSelected } = useSelectionLogic({
    selectedData,
    dataCategories,
    onSelectionChange
  })

  return (
    <div className="w-full space-y-2.5">
      {showScopeDescription ? (
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          {t.dataSelection.scopeDescription}
        </p>
      ) : null}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
        <TabsList className="grid h-9 w-full grid-cols-2 gap-1 border border-border/50 bg-muted/40 p-1">
          <TabsTrigger value="selection" className={`text-sm ${TAB_ACTIVE_CLASSES.selection}`}>
            {t.dataSelection.title}
          </TabsTrigger>
          <TabsTrigger value="preview" className={`text-sm ${TAB_ACTIVE_CLASSES.selection}`}>
            {t.common.preview}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="selection">
          <DataSelectionTab
            clinicalData={clinicalData}
            dataCategories={dataCategories}
            selectedData={selectedData}
            filters={filters}
            onToggle={handleToggle}
            onToggleAll={handleToggleAll}
            onFilterChange={handleFilterChange}
            allSelected={allSelected}
            someSelected={someSelected}
            modelId={modelId}
            fallbackModelId={fallbackModelId}
          />
        </TabsContent>
        <TabsContent value="preview">
          <PreviewTab
            formattedClinicalContext={activeTab === 'preview' ? getFormattedClinicalContext() : ''}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
