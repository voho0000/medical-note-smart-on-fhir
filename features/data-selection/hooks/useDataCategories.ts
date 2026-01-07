import { useMemo } from "react"
import { useLanguage } from "@/src/application/providers/language.provider"
import type { DataSelection, DataFilters } from "@/src/core/entities/clinical-context.entity"
import type { ClinicalDataCollection } from "@/src/core/entities/clinical-data.entity"
import { dataCategoryRegistry } from "@/src/core/registry/data-category.registry"

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
  
  return useMemo(() => {
    // Use filterKey to force recalculation when filters change
    const _ = filterKey
    
    // Get all registered categories from the registry
    const categories = dataCategoryRegistry.getAll()
    
    // Map registry categories to DataItem format
    return categories.map(category => {
      // Get translated label and description
      const labelParts = category.labelKey.split('.')
      const descParts = category.descriptionKey.split('.')
      
      // Navigate to the translation
      let label = category.label
      let description = category.description
      
      try {
        // Try to get translated label (e.g., t.dataSelection.labReports)
        if (labelParts[0] === 'dataSelection' && labelParts[1]) {
          label = (t.dataSelection as any)[labelParts[1]] || category.label
        }
        if (descParts[0] === 'dataSelection' && descParts[1]) {
          description = (t.dataSelection as any)[descParts[1]] || category.description
        }
      } catch {
        // Use default if translation fails
      }
      
      // Calculate count using the registry
      const count = dataCategoryRegistry.getCategoryCount(
        category.id,
        clinicalData,
        filters || {} as any
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
    t,
    clinicalData,
    filterKey,
    filters
  ])
}
