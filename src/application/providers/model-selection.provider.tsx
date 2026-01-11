/**
 * Model Selection Provider
 * Manages AI model selection across the application
 * Single Responsibility: Model selection and persistence
 */
"use client"

import { createContext, useContext, useEffect, useState, useMemo, type ReactNode, type Dispatch, type SetStateAction } from 'react'
import { DEFAULT_MODEL_ID, isModelId } from '@/src/shared/constants/ai-models.constants'

const MODEL_STORAGE_KEY = 'app:selected-model'

interface ModelSelectionContextValue {
  model: string
  setModel: Dispatch<SetStateAction<string>>
}

const ModelSelectionContext = createContext<ModelSelectionContextValue | null>(null)

export function ModelSelectionProvider({ children }: { children: ReactNode }) {
  const [model, setModel] = useState<string>(DEFAULT_MODEL_ID)

  // Load model from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const stored = window.localStorage.getItem(MODEL_STORAGE_KEY)
    if (stored && isModelId(stored)) {
      console.log('[ModelSelection] Restoring model:', stored)
      setModel(stored)
    } else {
      console.log('[ModelSelection] Using default model:', DEFAULT_MODEL_ID)
    }
  }, [])

  // Save model to localStorage when it changes
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    console.log('[ModelSelection] Saving model to localStorage:', model)
    window.localStorage.setItem(MODEL_STORAGE_KEY, model)
  }, [model])

  const value: ModelSelectionContextValue = useMemo(() => ({
    model,
    setModel,
  }), [model])

  return (
    <ModelSelectionContext.Provider value={value}>
      {children}
    </ModelSelectionContext.Provider>
  )
}

export function useModelSelection() {
  const ctx = useContext(ModelSelectionContext)
  if (!ctx) {
    throw new Error('useModelSelection must be used inside <ModelSelectionProvider>')
  }
  return ctx
}
