import { useEffect, useMemo, useState } from "react"
import { useChatTemplates } from "@/src/application/providers/chat-templates.provider"

const STORAGE_KEY = "selected-template-id"

export function useTemplateSelector() {
  const { templates, isLoading } = useChatTemplates()
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(() => {
    // Load from localStorage on mount
    if (typeof window !== "undefined") {
      return localStorage.getItem(STORAGE_KEY) || ""
    }
    return ""
  })
  const [hasValidated, setHasValidated] = useState(false)

  const selectedTemplate = useMemo(() => {
    if (!templates.length) {
      return undefined
    }
    const fallback = templates[0]
    if (!selectedTemplateId) {
      return fallback
    }
    return templates.find((template) => template.id === selectedTemplateId) ?? fallback
  }, [selectedTemplateId, templates])

  // Persist selectedTemplateId to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return
    if (selectedTemplateId) {
      localStorage.setItem(STORAGE_KEY, selectedTemplateId)
    }
  }, [selectedTemplateId])

  // Auto-select first template if current selection is invalid
  // Only validate ONCE after initial load, not on every template update
  useEffect(() => {
    // Wait for templates to finish loading before validating
    if (isLoading) return
    
    // Only validate once after initial load
    if (hasValidated) return
    
    if (!templates.length) return
    
    const isSelectedIdValid = templates.some((template) => template.id === selectedTemplateId)
    
    // Only update if we have a selectedTemplateId that's not in templates
    // OR if we don't have a selectedTemplateId at all
    if (selectedTemplateId && !isSelectedIdValid) {
      // The saved template ID is invalid, select first template
      setSelectedTemplateId(templates[0].id)
    } else if (!selectedTemplateId) {
      // No selection yet, select first template
      setSelectedTemplateId(templates[0].id)
    }
    
    // Mark as validated
    setHasValidated(true)
  }, [templates, isLoading, hasValidated, selectedTemplateId])

  const setAsDefault = (templateId: string) => {
    setSelectedTemplateId(templateId)
  }

  return {
    templates,
    selectedTemplate,
    selectedTemplateId,
    setSelectedTemplateId,
    setAsDefault,
  }
}
