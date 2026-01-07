// Application Provider: Data Selection
"use client"

import { createContext, useContext, useEffect, useState, useMemo, useCallback, type ReactNode } from 'react'
import { StorageService } from '@/src/shared/utils/storage.utils'
import { DEFAULT_DATA_SELECTION, DEFAULT_DATA_FILTERS, STORAGE_KEYS } from '@/src/shared/constants/data-selection.constants'
import type { DataSelection, DataFilters } from '@/src/core/entities/clinical-context.entity'
import { ensureCategoriesInitialized } from '@/src/core/categories/init'

// Initialize categories on module load
ensureCategoriesInitialized()

type DataType = keyof DataSelection

interface DataSelectionContextValue {
  selectedData: DataSelection
  setSelectedData: React.Dispatch<React.SetStateAction<DataSelection>>
  updateSelection: (dataType: DataType, isSelected: boolean) => void
  resetToDefaults: () => void
  filters: DataFilters
  setFilters: React.Dispatch<React.SetStateAction<DataFilters>>
  isAnySelected: boolean
  supplementaryNotes: string
  setSupplementaryNotes: React.Dispatch<React.SetStateAction<string>>
  editedClinicalContext: string | null
  setEditedClinicalContext: React.Dispatch<React.SetStateAction<string | null>>
}

const DataSelectionContext = createContext<DataSelectionContextValue | null>(null)

const storage = new StorageService('localStorage')

function getInitialSelection(): DataSelection {
  const saved = storage.get<Partial<DataSelection>>(STORAGE_KEYS.DATA_SELECTION)
  if (!saved) return DEFAULT_DATA_SELECTION

  return {
    ...DEFAULT_DATA_SELECTION,
    ...saved
  }
}

function getInitialFilters(): DataFilters {
  const saved = storage.get<Partial<DataFilters>>(STORAGE_KEYS.DATA_FILTERS)
  if (!saved) return DEFAULT_DATA_FILTERS

  return {
    ...DEFAULT_DATA_FILTERS,
    ...saved
  }
}

export function DataSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedData, setSelectedData] = useState<DataSelection>(getInitialSelection)
  const [filters, setFilters] = useState<DataFilters>(getInitialFilters)
  const [supplementaryNotes, setSupplementaryNotes] = useState<string>('')
  const [editedClinicalContext, setEditedClinicalContext] = useState<string | null>(null)

  // Save to storage whenever selection changes
  useEffect(() => {
    storage.set(STORAGE_KEYS.DATA_SELECTION, selectedData)
  }, [selectedData])

  // Save to storage whenever filters change
  useEffect(() => {
    storage.set(STORAGE_KEYS.DATA_FILTERS, filters)
  }, [filters])

  const updateSelection = useCallback((dataType: DataType, isSelected: boolean) => {
    setSelectedData(prev => ({
      ...prev,
      [dataType]: isSelected
    }))
  }, [])

  const resetToDefaults = useCallback(() => {
    setSelectedData(DEFAULT_DATA_SELECTION)
    setFilters(DEFAULT_DATA_FILTERS)
  }, [])

  const value = useMemo(
    () => ({
      selectedData,
      setSelectedData,
      updateSelection,
      resetToDefaults,
      filters,
      setFilters,
      isAnySelected: Object.values(selectedData).some(Boolean),
      supplementaryNotes,
      setSupplementaryNotes,
      editedClinicalContext,
      setEditedClinicalContext
    }),
    [selectedData, filters, supplementaryNotes, editedClinicalContext, updateSelection, resetToDefaults]
  )

  return <DataSelectionContext.Provider value={value}>{children}</DataSelectionContext.Provider>
}

export function useDataSelection() {
  const context = useContext(DataSelectionContext)
  if (!context) {
    throw new Error('useDataSelection must be used within DataSelectionProvider')
  }
  return context
}
