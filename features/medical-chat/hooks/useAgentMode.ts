/**
 * Agent Mode Hook
 * 
 * Manages agent mode state and its related API key warning.
 * These two states are logically related:
 * - Agent mode requires API key
 * - Warning is shown when agent mode is enabled without API key
 * 
 * High Cohesion: Both states are part of the same business logic
 */
import { useState, useCallback } from "react"

export function useAgentMode() {
  const [isAgentMode, setIsAgentMode] = useState(false)
  const [showApiKeyWarning, setShowApiKeyWarning] = useState(false)

  const enableAgentMode = useCallback(() => {
    setIsAgentMode(true)
  }, [])

  const disableAgentMode = useCallback(() => {
    setIsAgentMode(false)
  }, [])

  const showWarning = useCallback(() => {
    setShowApiKeyWarning(true)
  }, [])

  const hideWarning = useCallback(() => {
    setShowApiKeyWarning(false)
  }, [])

  const toggleAgentMode = useCallback(() => {
    setIsAgentMode(prev => !prev)
  }, [])

  return {
    // States
    isAgentMode,
    showApiKeyWarning,
    
    // Setters (for direct control when needed)
    setIsAgentMode,
    setShowApiKeyWarning,
    
    // Semantic actions
    enableAgentMode,
    disableAgentMode,
    toggleAgentMode,
    showWarning,
    hideWarning,
  }
}
