import { useMemo, useState } from "react"
import type { DataFilters } from "@/src/core/entities/clinical-context.entity"

export function useDataFiltering(filters: DataFilters, onFiltersChange: (filters: DataFilters) => void) {
  const [filterKey, setFilterKey] = useState(0)

  const isWithinTimeRange = (dateString: string | undefined, range: string): boolean => {
    if (!dateString) return false
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return false
    
    const now = new Date()
    const diffInMs = now.getTime() - date.getTime()
    const diffInDays = diffInMs / (1000 * 60 * 60 * 24)
    
    switch (range) {
      case '24h': return diffInDays <= 1
      case '3d': return diffInDays <= 3
      case '1w': return diffInDays <= 7
      case '1m': return diffInDays <= 30
      case '3m': return diffInDays <= 90
      case '6m': return diffInDays <= 180
      case '1y': return diffInDays <= 365
      case 'all':
      default:
        return true
    }
  }

  const getLatestVersions = (items: any[]) => {
    const latestVersions = new Map()
    
    items.forEach(item => {
      const [baseId] = item.id?.split('/_history/') || []
      if (!baseId) return
      
      const existing = latestVersions.get(baseId)
      const currentVersion = parseInt(item.meta?.versionId || '0', 10)
      const existingVersion = parseInt(existing?.meta?.versionId || '0', 10)
      
      if (!existing || currentVersion > existingVersion) {
        latestVersions.set(baseId, item)
      }
    })
    
    return Array.from(latestVersions.values())
  }

  const getFilteredCount = (items: any[], dataType: 'diagnosticReports' | 'observations' = 'diagnosticReports') => {
    if (!items || !items.length) return 0
    if (!filters) return items.length
    
    let filteredItems = [...items]
    if (dataType === 'diagnosticReports') {
      if (filters.labReportVersion === 'latest') {
        filteredItems = getLatestVersions(items)
      }
    } else if (dataType === 'observations') {
      if (filters.vitalSignsVersion === 'latest') {
        filteredItems = getLatestVersions(items)
      }
    }
    
    const timeRange = dataType === 'diagnosticReports' 
      ? filters.reportTimeRange 
      : filters.vitalSignsTimeRange
      
    if (!timeRange || timeRange === 'all') return filteredItems.length
    
    return filteredItems.filter(item => {
      const date = item.effectiveDateTime
      return isWithinTimeRange(date, timeRange)
    }).length
  }

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
    getFilteredCount,
    handleFilterChange,
  }
}
