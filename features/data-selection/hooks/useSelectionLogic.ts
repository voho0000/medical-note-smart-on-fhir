// Selection Logic Hook
// Separates selection logic from UI concerns (Single Responsibility Principle)
// Makes the logic reusable and testable

import { useCallback, useMemo } from "react"
import type { DataSelection } from "@/src/core/entities/clinical-context.entity"
import type { DataItem, DataType } from "./useDataCategories"

interface UseSelectionLogicProps {
  selectedData: DataSelection
  dataCategories: DataItem[]
  onSelectionChange: (selectedData: DataSelection) => void
}

interface UseSelectionLogicReturn {
  handleToggle: (id: DataType, checked: boolean) => void
  handleToggleAll: (checked: boolean) => void
  allSelected: boolean
  someSelected: boolean
}

/**
 * Hook for managing data selection logic
 * Encapsulates all selection-related business logic
 * Following Single Responsibility Principle
 */
export function useSelectionLogic({
  selectedData,
  dataCategories,
  onSelectionChange
}: UseSelectionLogicProps): UseSelectionLogicReturn {
  
  const handleToggle = useCallback((id: DataType, checked: boolean) => {
    const newSelection: DataSelection = {
      ...selectedData,
      [id]: checked
    }
    onSelectionChange(newSelection)
  }, [selectedData, onSelectionChange])

  const handleToggleAll = useCallback((checked: boolean) => {
    const newSelection: DataSelection = { ...selectedData }
    dataCategories.forEach(item => {
      newSelection[item.id] = checked
    })
    onSelectionChange(newSelection)
  }, [selectedData, dataCategories, onSelectionChange])

  const allSelected = useMemo(() => 
    dataCategories.every(item => selectedData[item.id]), 
    [dataCategories, selectedData]
  )
  
  const someSelected = useMemo(() => 
    dataCategories.some(item => selectedData[item.id]) && !allSelected,
    [dataCategories, selectedData, allSelected]
  )

  return {
    handleToggle,
    handleToggleAll,
    allSelected,
    someSelected
  }
}
