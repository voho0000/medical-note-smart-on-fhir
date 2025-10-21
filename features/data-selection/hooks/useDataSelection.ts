// features/data-selection/hooks/useDataSelection.ts
"use client"

import { useState, useEffect, useCallback } from "react"

export type DataType = 'conditions' | 'medications' | 'allergies' | 'diagnosticReports' | 'observations'

export type DataSelection = Record<DataType, boolean>

export type MedicationStatus = 'active' | 'all'
export type ReportInclusion = 'latest' | 'all'
export type TimeRange = '1w' | '1m' | '3m' | '6m' | '1y' | 'all'

export interface DataFilters {
  medicationStatus: MedicationStatus
  reportInclusion: ReportInclusion
  reportTimeRange: TimeRange
  labReportVersion: 'latest' | 'all'
  vitalSignsVersion: 'latest' | 'all'
  vitalSignsTimeRange: '24h' | '3d' | '1w' | '1m' | '3m' | 'all'
}

const DEFAULT_FILTERS: DataFilters = {
  medicationStatus: 'active',
  reportInclusion: 'latest',
  reportTimeRange: 'all',
  labReportVersion: 'latest',
  vitalSignsVersion: 'latest',
  vitalSignsTimeRange: 'all'
}

const STORAGE_KEY = 'clinicalDataSelection'
const FILTERS_STORAGE_KEY = 'clinicalDataFilters'

const DEFAULT_SELECTION: DataSelection = {
  conditions: true,
  medications: true,
  allergies: true,
  diagnosticReports: true,
  observations: true
}

const isValidDataSelection = (data: unknown): data is Partial<DataSelection> => {
  return typeof data === 'object' && data !== null
}

const getInitialSelection = (): DataSelection => {
  if (typeof window === 'undefined') return DEFAULT_SELECTION
  
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return DEFAULT_SELECTION
    
    const parsed = JSON.parse(saved)
    if (!isValidDataSelection(parsed)) return DEFAULT_SELECTION
    
    // Only include valid data types from the saved selection
    return Object.fromEntries(
      Object.entries(DEFAULT_SELECTION).map(([key]) => [
        key,
        key in parsed ? parsed[key as DataType] : DEFAULT_SELECTION[key as DataType]
      ])
    ) as DataSelection
  } catch (error) {
    console.error('Failed to load saved data selection:', error)
    return DEFAULT_SELECTION
  }
}

const getInitialFilters = (): DataFilters => {
  if (typeof window === 'undefined') return DEFAULT_FILTERS
  
  try {
    const saved = localStorage.getItem(FILTERS_STORAGE_KEY)
    if (!saved) return DEFAULT_FILTERS
    
    const parsed = JSON.parse(saved)
    return {
      medicationStatus: ['active', 'all'].includes(parsed.medicationStatus) 
        ? parsed.medicationStatus 
        : DEFAULT_FILTERS.medicationStatus,
      reportInclusion: ['latest', 'all'].includes(parsed.reportInclusion)
        ? parsed.reportInclusion
        : DEFAULT_FILTERS.reportInclusion,
      reportTimeRange: ['1w', '1m', '3m', '6m', '1y', 'all'].includes(parsed.reportTimeRange)
        ? parsed.reportTimeRange
        : DEFAULT_FILTERS.reportTimeRange,
      labReportVersion: ['latest', 'all'].includes(parsed.labReportVersion)
        ? parsed.labReportVersion
        : DEFAULT_FILTERS.labReportVersion,
      vitalSignsVersion: ['latest', 'all'].includes(parsed.vitalSignsVersion)
        ? parsed.vitalSignsVersion
        : DEFAULT_FILTERS.vitalSignsVersion,
      vitalSignsTimeRange: ['24h', '3d', '1w', '1m', '3m', 'all'].includes(parsed.vitalSignsTimeRange)
        ? parsed.vitalSignsTimeRange
        : DEFAULT_FILTERS.vitalSignsTimeRange
    }
  } catch (error) {
    console.error('Failed to load saved filters:', error)
    return DEFAULT_FILTERS
  }
}

export function useDataSelection() {
  const [selectedData, setSelectedData] = useState<DataSelection>(getInitialSelection)
  const [filters, setFilters] = useState<DataFilters>(getInitialFilters)

  // Save to localStorage whenever selection changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedData))
    } catch (error) {
      console.error('Failed to save data selection:', error)
    }
  }, [selectedData])

  // Save filters to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters))
    } catch (error) {
      console.error('Failed to save filters:', error)
    }
  }, [filters])

  const updateSelection = useCallback((dataType: DataType, isSelected: boolean) => {
    setSelectedData(prev => ({
      ...prev,
      [dataType]: isSelected
    }))
  }, [])

  const setSelection = useCallback((newSelection: Partial<DataSelection>) => {
    setSelectedData(prev => {
      // Only update with valid data types
      const validUpdates = Object.entries(newSelection).reduce((acc, [key, value]) => {
        if (key in DEFAULT_SELECTION) {
          acc[key as DataType] = value as boolean
        }
        return acc
      }, {} as Partial<DataSelection>)
      
      return { ...prev, ...validUpdates }
    })
  }, [])

  const resetToDefaults = useCallback(() => {
    setSelectedData(DEFAULT_SELECTION)
    setFilters(DEFAULT_FILTERS)
  }, [])

  return {
    selectedData,
    setSelectedData,
    updateSelection,
    setSelection,
    resetToDefaults,
    filters,
    setFilters,
    isAnySelected: Object.values(selectedData).some(Boolean)
  }
}
