// Hook: Use Data Categories
// Provides access to registered data categories with computed counts

"use client"

import { useMemo } from 'react'
import { dataCategoryRegistry } from '@/src/core/registry/data-category.registry'
import type { DataCategory, DataCategoryRegistry } from '@/src/core/interfaces/data-category.interface'
import type { DataSelection, DataFilters } from '@/src/core/entities/clinical-context.entity'

export interface DataCategoryItem {
  id: string
  label: string
  labelKey: string
  description: string
  descriptionKey: string
  group: string
  count: number
  filters?: Array<{
    key: string
    type: 'select' | 'toggle'
    label: string
    options?: { value: string; label: string }[]
    defaultValue: string | boolean | number
  }>
}

export function useDataCategories(
  clinicalData: any,
  filters: DataFilters
): DataCategoryItem[] {
  return useMemo(() => {
    const categories = dataCategoryRegistry.getAll()
    
    return categories.map(category => ({
      id: category.id,
      label: category.label,
      labelKey: category.labelKey,
      description: category.description,
      descriptionKey: category.descriptionKey,
      group: category.group,
      count: dataCategoryRegistry.getCategoryCount(category.id, clinicalData, filters),
      filters: category.filters
    }))
  }, [clinicalData, filters])
}

export function useDataCategoryContext(
  selection: DataSelection,
  clinicalData: any,
  filters: DataFilters
) {
  return useMemo(() => {
    return dataCategoryRegistry.getAllContextSections(selection, clinicalData, filters)
  }, [selection, clinicalData, filters])
}
