import { useMemo } from "react"
import { useLanguage } from "@/src/application/providers/language.provider"
import type { DataSelection, DataFilters } from "@/src/core/entities/clinical-context.entity"
import type { ClinicalDataCollection } from "@/src/core/entities/clinical-data.entity"
import { dataCategoryRegistry } from "@/src/core/registry/data-category.registry"
import { TranslationService } from "@/src/core/services/translation.service"

export type DataType = keyof DataSelection

export interface DataItem {
  id: DataType
  label: string
  description: string
  count: number
  category?: string
}

export function useDataCategories(
  clinicalData: ClinicalDataCollection,
  filterKey: number,
  filters?: Partial<DataFilters>
) {
  const { t } = useLanguage()
  
  // A structural key keeps the calculation stable when callers recreate an
  // equivalent filter object. Rebuild the object from the key so the memo does
  // not close over an untracked `filters` reference.
  const filtersHash = JSON.stringify(filters || {})
  
  return useMemo(() => {
    // The caller increments this key when registry-backed counts must be
    // recomputed even if the collection reference itself did not change.
    void filterKey
    // Get all registered categories from the registry
    const categories = dataCategoryRegistry.getAll()
    
    // Ensure filters is a valid object
    const safeFilters = JSON.parse(filtersHash) as Partial<DataFilters>
    
    // Map registry categories to DataItem format
    return categories.map(category => {
      // Get translated label and description using Translation Service
      const labelParts = category.labelKey.split('.')
      const descParts = category.descriptionKey.split('.')
      
      let label = category.label
      let description = category.description
      
      // Safely get translations without type assertions
      if (labelParts[0] === 'dataSelection' && labelParts[1]) {
        label = TranslationService.get(
          t.dataSelection as Record<string, unknown>,
          labelParts[1],
          category.label
        )
      }
      if (descParts[0] === 'dataSelection' && descParts[1]) {
        description = TranslationService.get(
          t.dataSelection as Record<string, unknown>,
          descParts[1],
          category.description
        )
      }
      
      // Calculate count using the registry
      // Note: Registry accepts Partial<DataFilters> internally
      const count = dataCategoryRegistry.getCategoryCount(
        category.id,
        clinicalData,
        safeFilters as DataFilters
      )
      
      return {
        id: category.id as DataType,
        label,
        description,
        count,
        category: category.group
      }
    })
  }, [
    t.dataSelection,
    clinicalData,
    filterKey,
    filtersHash
  ])
}
