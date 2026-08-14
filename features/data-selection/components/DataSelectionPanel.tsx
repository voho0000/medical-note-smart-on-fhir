"use client"

import { useCallback, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  SUBTAB_LIST_CLASSES,
  SUBTAB_TRIGGER_CLASSES,
} from "@/src/shared/config/ui-theme.config"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useClinicalContext } from "@/src/application/hooks/use-clinical-context.hook"
import { useClinicalAiInput } from "@/src/application/hooks/ai-generation/use-clinical-ai-input.hook"
import { formatClinicalContextAdaptationNotice } from "@/src/core/utils/adaptive-clinical-context.utils"
import { useDataFiltering } from "../hooks/useDataFiltering"
import { useDataCategories } from "../hooks/useDataCategories"
import { useSelectionLogic } from "../hooks/useSelectionLogic"
import { useResolvedDataSelectionModel } from "../hooks/useResolvedDataSelectionModel"
import {
  mergeDisplayedFiltersChange,
  mergeDisplayedSelectionChange,
} from "../model-fitted-profile"
import { DataSelectionTab } from "./DataSelectionTab"
import { PreviewTab } from "./PreviewTab"
import type { DataSelection, DataFilters } from "@/src/core/entities/clinical-context.entity"
import type { ClinicalDataCollection } from "@/src/core/entities/clinical-data.entity"
import type { ContextOverflowIssue } from "@/src/shared/utils/context-budget"
import type { DataConsumer } from "@/src/application/providers/data-selection.provider"

interface DataSelectionPanelProps {
  clinicalData: ClinicalDataCollection
  selectedData: DataSelection
  filters: DataFilters
  onSelectionChange: (selectedData: DataSelection) => void
  onFiltersChange: (filters: DataFilters) => void
  modelId?: string
  fallbackModelId?: string
  showScopeDescription?: boolean
  overflowIssue?: ContextOverflowIssue | null
  consumer?: DataConsumer
  showTemplates?: boolean
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
  overflowIssue,
  consumer = 'insights',
  showTemplates = true,
}: DataSelectionPanelProps) {
  const { t, locale } = useLanguage()
  // Preview the same summary/insights scope that this panel edits.
  const { getFormattedClinicalContext, getFullClinicalContext } = useClinicalContext(consumer)
  const resolvedModel = useResolvedDataSelectionModel(modelId, fallbackModelId)
  const fittedClinicalInput = useClinicalAiInput(
    consumer === 'insights' ? resolvedModel.contextLimit : undefined,
    consumer,
  )
  const [activeTab, setActiveTab] = useState('selection')
  const displayedProfile = fittedClinicalInput.contextAdaptation
    ? fittedClinicalInput.effectiveProfile
    : null
  const displayedSelection = displayedProfile?.selection ?? selectedData
  const displayedFilters = displayedProfile?.filters ?? filters

  const handleDisplayedSelectionChange = useCallback(
    (nextDisplayed: DataSelection) => {
      onSelectionChange(
        displayedProfile
          ? mergeDisplayedSelectionChange(
              selectedData,
              displayedSelection,
              nextDisplayed,
            )
          : nextDisplayed,
      )
    },
    [
      displayedProfile,
      displayedSelection,
      onSelectionChange,
      selectedData,
    ],
  )
  const handleDisplayedFiltersChange = useCallback(
    (nextDisplayed: DataFilters) => {
      onFiltersChange(
        displayedProfile
          ? mergeDisplayedFiltersChange(filters, displayedFilters, nextDisplayed)
          : nextDisplayed,
      )
    },
    [displayedFilters, displayedProfile, filters, onFiltersChange],
  )
  const { filterKey, handleFilterChange } = useDataFiltering(
    displayedFilters,
    handleDisplayedFiltersChange,
  )
  const dataCategories = useDataCategories(
    clinicalData,
    filterKey,
    displayedFilters,
  )

  // Use selection logic hook (Single Responsibility Principle)
  const { handleToggle, handleToggleAll, allSelected, someSelected } = useSelectionLogic({
    selectedData: displayedSelection,
    dataCategories,
    onSelectionChange: handleDisplayedSelectionChange,
  })

  return (
    <div className="w-full space-y-2.5">
      {showScopeDescription ? (
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          {t.dataSelection.scopeDescription}
        </p>
      ) : null}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full gap-0">
        <TabsList className={`${SUBTAB_LIST_CLASSES} grid w-full grid-cols-2`}>
          <TabsTrigger value="selection" className={SUBTAB_TRIGGER_CLASSES}>
            {t.dataSelection.title}
          </TabsTrigger>
          <TabsTrigger value="preview" className={SUBTAB_TRIGGER_CLASSES}>
            {t.common.preview}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="selection" className="mt-4">
          <DataSelectionTab
            clinicalData={clinicalData}
            dataCategories={dataCategories}
            selectedData={displayedSelection}
            filters={displayedFilters}
            displayedDocumentMode={displayedProfile?.documentMode}
            displayedDocumentIds={displayedProfile?.documentIds}
            onToggle={handleToggle}
            onToggleAll={handleToggleAll}
            onFilterChange={handleFilterChange}
            allSelected={allSelected}
            someSelected={someSelected}
            modelId={modelId}
            fallbackModelId={fallbackModelId}
            overflowIssue={overflowIssue}
            consumer={consumer}
            showTemplates={showTemplates}
          />
        </TabsContent>
        <TabsContent value="preview" className="mt-4">
          <PreviewTab
            formattedClinicalContext={activeTab === 'preview'
              ? fittedClinicalInput.contextAdaptation
                ? fittedClinicalInput.formattedClinicalContext
                : getFormattedClinicalContext()
              : ''}
            maskedClinicalContext={activeTab === 'preview'
              ? fittedClinicalInput.contextAdaptation
                ? fittedClinicalInput.clinicalContext
                : getFullClinicalContext()
              : ''}
            scopeNotice={fittedClinicalInput.contextAdaptation
              ? formatClinicalContextAdaptationNotice(
                  fittedClinicalInput.contextAdaptation,
                  locale,
                )
              : undefined}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
