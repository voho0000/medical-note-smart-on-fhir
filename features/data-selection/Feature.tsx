// features/data-selection/Feature.tsx
"use client"

import { useMemo, useCallback } from "react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"
import { DataSelectionPanel } from "./components/DataSelectionPanel"
import { useDataSelection } from "@/src/application/providers/data-selection.provider"
import { useClinicalDataMapper } from "@/src/application/hooks/data/use-clinical-data-mapper.hook"
import type { DataFilters } from "@/src/core/entities/clinical-context.entity"

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
}

export function DataSelectionFeature() {
  const { t } = useLanguage()
  const rawClinicalData = useClinicalData() as RawClinicalData
  const clinicalDataMapper = useClinicalDataMapper()
  const { 
    selectedData, 
    setSelectedData, 
    filters, 
    setFilters 
  } = useDataSelection()

  // Use ClinicalDataMapper service to transform data (Dependency Inversion Principle)
  const mappedData = useMemo(() => {
    if (!rawClinicalData || rawClinicalData.isLoading) {
      return clinicalDataMapper.getEmptyCollection()
    }
    return clinicalDataMapper.toClinicalDataCollection(rawClinicalData)
  }, [rawClinicalData, clinicalDataMapper])

  const handleFiltersChange = useCallback((newFilters: DataFilters) => {
    setFilters(newFilters)
  }, [setFilters])

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
        onFiltersChange={handleFiltersChange}
      />
    </div>
  )
}
