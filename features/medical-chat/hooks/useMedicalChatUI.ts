/**
 * Medical Chat UI State Hook
 * 
 * Manages local UI states for the Medical Chat component.
 * Consolidates related UI states into a single hook for better organization.
 */
import { useState, useCallback } from "react"

export function useMedicalChatUI() {
  const [isAgentMode, setIsAgentMode] = useState(false)
  const [showApiKeyWarning, setShowApiKeyWarning] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const toggleAgentMode = useCallback(() => {
    setIsAgentMode(prev => !prev)
  }, [])

  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev)
  }, [])

  const showWarning = useCallback(() => {
    setShowApiKeyWarning(true)
  }, [])

  const hideWarning = useCallback(() => {
    setShowApiKeyWarning(false)
  }, [])

  return {
    // States
    isAgentMode,
    showApiKeyWarning,
    isExpanded,
    
    // Actions
    setIsAgentMode,
    toggleAgentMode,
    setShowApiKeyWarning,
    showWarning,
    hideWarning,
    setIsExpanded,
    toggleExpanded,
  }
}
