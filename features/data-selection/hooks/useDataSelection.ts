// features/data-selection/hooks/useDataSelection.ts
"use client"

import { useState, useEffect, useCallback } from "react"

export type DataType = 'conditions' | 'medications' | 'allergies' | 'diagnosticReports' | 'observations'

export type DataSelection = Record<DataType, boolean>

const STORAGE_KEY = 'clinicalDataSelection'
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

export function useDataSelection() {
  const [selectedData, setSelectedData] = useState<DataSelection>(getInitialSelection)

  // Save to localStorage whenever selection changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedData))
    } catch (error) {
      console.error('Failed to save data selection:', error)
    }
  }, [selectedData])

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
  }, [])

  return {
    selectedData,
    setSelectedData,
    updateSelection,
    setSelection,
    resetToDefaults,
    isAnySelected: Object.values(selectedData).some(Boolean)
  }
}
