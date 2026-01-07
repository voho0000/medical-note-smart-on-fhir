import { useState } from "react"
import type { DataFilters } from "@/src/core/entities/clinical-context.entity"

/**
 * Hook for managing data filtering state
 * Note: Count calculation is now handled by DataCategory registry
 */
export function useDataFiltering(filters: DataFilters, onFiltersChange: (filters: DataFilters) => void) {
  const [filterKey, setFilterKey] = useState(0)

  const handleFilterChange = (key: keyof DataFilters, value: any) => {
    const newFilters = {
      ...filters,
      [key]: value
    }
    
    onFiltersChange({ ...newFilters })
    setFilterKey(prev => prev + 1)
  }

  return {
    filterKey,
    handleFilterChange,
  }
}
