import { useEffect, useMemo, useState } from "react"
import { useChatTemplates } from "@/src/application/providers/chat-templates.provider"

const STORAGE_KEY = "selected-template-id"

export function useTemplateSelector() {
  const { templates, isLoading } = useChatTemplates()
  // SSR-safe: start empty so the first client render matches the prerendered
  // (static-export) HTML, which has no localStorage → templates[0]. Reading
  // localStorage in the useState initializer made the client's first render
  // diverge (saved template vs default) → React hydration mismatch.
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")
  const [hasInitialized, setHasInitialized] = useState(false)

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

  // One-time init AFTER mount + templates load: restore the persisted
  // selection, validate it against current templates, fall back to the first.
  // Reading localStorage here (not in the useState initializer) is what keeps
  // the first client render identical to the server/prerendered HTML.
  useEffect(() => {
    if (isLoading || hasInitialized || !templates.length) return

    const stored =
      typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null
    const isValid = stored ? templates.some((t) => t.id === stored) : false

    setSelectedTemplateId(isValid ? (stored as string) : templates[0].id)
    setHasInitialized(true)
  }, [templates, isLoading, hasInitialized])

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
