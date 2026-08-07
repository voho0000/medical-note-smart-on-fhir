// features/data-selection/Feature.tsx
"use client"

import { useMemo, useCallback } from "react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"
import { DataSelectionPanel } from "./components/DataSelectionPanel"
import { useDataSelection } from "@/src/application/providers/data-selection.provider"
import { useClinicalDataMapper } from "@/src/application/hooks/data/use-clinical-data-mapper.hook"
import type { DataFilters, DataSelection } from "@/src/core/entities/clinical-context.entity"
import type { ContextOverflowIssue } from "@/src/shared/utils/context-budget"
import type { DataConsumer } from "@/src/application/providers/data-selection.provider"

/**
 * Raw clinical data type from provider (includes loading state)
 */
interface RawClinicalData {
  conditions?: unknown[]
  medications?: unknown[]
  allergies?: unknown[]
  diagnosticReports?: unknown[]
  vitalSigns?: unknown[]
  vitals?: unknown[]
  observations?: unknown[]
  encounters?: unknown[]
  procedures?: unknown[]
  isLoading: boolean
  error?: Error | null
}

export interface DataSelectionFeatureProps {
  /** Model used for context-budget feedback by the embedding feature. */
  modelId?: string
  fallbackModelId?: string
  /** Standalone surfaces may keep the explanatory line; drawers own it in their header. */
  showScopeDescription?: boolean
  overflowIssue?: ContextOverflowIssue | null
  consumer?: DataConsumer
  showTemplates?: boolean
}

export function DataSelectionFeature({
  modelId,
  fallbackModelId,
  showScopeDescription = true,
  overflowIssue,
  consumer = 'insights',
  showTemplates = true,
}: DataSelectionFeatureProps = {}) {
  const { t } = useLanguage()
  const rawClinicalData = useClinicalData() as RawClinicalData
  const clinicalDataMapper = useClinicalDataMapper()
  const dataSelection = useDataSelection()
  const {
    setSelectedData: setMainSelectedData,
    setSelectionFor,
    setFilters: setMainFilters,
    setFiltersFor,
  } = dataSelection
  const profile = dataSelection.getProfile(consumer)
  const selectedData = consumer === 'insights' ? dataSelection.selectedData : profile.selection
  const filters = consumer === 'insights' ? dataSelection.filters : profile.filters
  const setSelectedData = useCallback((next: DataSelection) => {
    if (consumer === 'insights') setMainSelectedData(next)
    else setSelectionFor(consumer, next)
  }, [consumer, setMainSelectedData, setSelectionFor])
  const setFilters = useCallback((next: DataFilters) => {
    if (consumer === 'insights') setMainFilters(next)
    else setFiltersFor(consumer, next)
  }, [consumer, setMainFilters, setFiltersFor])

  // Use ClinicalDataMapper service to transform data (Dependency Inversion Principle)
  const mappedData = useMemo(() => {
    if (!rawClinicalData || rawClinicalData.isLoading) {
      return clinicalDataMapper.getEmptyCollection()
    }
    return clinicalDataMapper.toClinicalDataCollection(rawClinicalData)
  }, [rawClinicalData, clinicalDataMapper])

  // Note: the sparse-patient auto-select-all runs app-wide via
  // <AdaptiveDataDefaultsRunner/> (mounted in RightPanelProviders), not here —
  // so it applies even when this panel was never opened.

  if (rawClinicalData.isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
          <p className="text-sm text-muted-foreground">{t.dataSelection.loadingData}</p>
        </div>
      </div>
    )
  }

  if (rawClinicalData.error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <div className="text-destructive mb-2">
            <div className="font-medium mb-1">{t.common.error}</div>
            <p className="text-sm">{rawClinicalData.error instanceof Error ? rawClinicalData.error.message : t.errors.fetchClinicalData}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!rawClinicalData || !clinicalDataMapper.isValid(rawClinicalData)) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-muted-foreground">{t.dataSelection.noDataAvailable}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <DataSelectionPanel 
        clinicalData={mappedData}
        selectedData={selectedData}
        onSelectionChange={setSelectedData}
        filters={filters}
        onFiltersChange={setFilters}
        modelId={modelId}
        fallbackModelId={fallbackModelId}
        overflowIssue={overflowIssue}
        showScopeDescription={showScopeDescription}
        consumer={consumer}
        showTemplates={showTemplates}
      />
    </div>
  )
}
