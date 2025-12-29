import { useEffect, useMemo, useState } from "react"
import { usePromptTemplates } from "@/src/application/providers/prompt-templates.provider"

export function useTemplateSelector() {
  const { templates } = usePromptTemplates()
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")

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

  useEffect(() => {
    if (!templates.length) {
      setSelectedTemplateId("")
      return
    }
    if (!templates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(templates[0].id)
    }
  }, [selectedTemplateId, templates])

  return {
    templates,
    selectedTemplate,
    selectedTemplateId,
    setSelectedTemplateId,
  }
}
