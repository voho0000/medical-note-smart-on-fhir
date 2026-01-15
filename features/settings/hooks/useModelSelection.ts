// Custom Hook: Model Selection Logic
import { useMemo } from 'react'
import { useLanguage } from '@/src/application/providers/language.provider'
import {
  GPT_MODELS,
  GEMINI_MODELS,
  DEFAULT_MODEL_ID,
  getModelDefinition,
  isModelId,
  ModelDefinition,
} from "@/src/shared/constants/ai-models.constants"
import { hasChatProxy, hasGeminiProxy } from "@/src/shared/config/env.config"

export interface ModelEntry {
  id: string
  label: string
  description: string
  isLocked: boolean
}

export function useModelSelection(
  apiKey: string | null,
  geminiKey: string | null,
  model: string,
  setModel: (model: string) => void
) {
  const { t } = useLanguage()
  const gptModels = useMemo(() => {
    return GPT_MODELS.map((entry): ModelEntry => {
      const definition = getModelDefinition(entry.id)
      const isLocked = definition?.requiresUserKey && !apiKey
      const description = t.settings.modelDescriptions[entry.id as keyof typeof t.settings.modelDescriptions] || ''
      return {
        id: entry.id,
        label: entry.label,
        description,
        isLocked: isLocked || false
      }
    })
  }, [apiKey, t.settings.modelDescriptions])

  const geminiModels = useMemo(() => {
    return GEMINI_MODELS.map((entry): ModelEntry => {
      const definition = getModelDefinition(entry.id)
      const isLocked = definition?.requiresUserKey && !geminiKey
      const description = t.settings.modelDescriptions[entry.id as keyof typeof t.settings.modelDescriptions] || ''
      return {
        id: entry.id,
        label: entry.label,
        description,
        isLocked: isLocked || false
      }
    })
  }, [geminiKey, t.settings.modelDescriptions])

  const handleSelectModel = (candidate: string) => {
    if (!isModelId(candidate)) return
    const definition = getModelDefinition(candidate)
    if (!definition) return

    if (definition.provider === "openai" && definition.requiresUserKey && !apiKey) {
      alert("Add an OpenAI API key to use premium GPT models.")
      return
    }

    if (definition.provider === "openai" && !definition.requiresUserKey && !apiKey && !hasChatProxy) {
      alert("Configure the Firebase Functions proxy or add your OpenAI key to use this model.")
      return
    }

    if (definition.provider === "gemini" && !geminiKey && !hasGeminiProxy) {
      alert("Add a Gemini API key or configure the Firebase Functions proxy before using this model.")
      return
    }

    setModel(candidate)
  }

  const getModelStatus = (definition: ModelDefinition) => {
    if (definition.provider === "openai") {
      if (definition.requiresUserKey) {
        return apiKey ? t.settings.usingPersonalOpenAiKey : t.settings.requiresOpenAiKey
      }
      if (apiKey) return t.settings.willUsePersonalOpenAiKey
      if (hasChatProxy) return t.settings.routedViaProxy
      return t.settings.requiresProxyOrOpenAiKey
    }

    if (definition.provider === "gemini") {
      if (geminiKey) return t.settings.usingPersonalGeminiKey
      if (hasGeminiProxy) return t.settings.routedViaProxy
      return t.settings.requiresGeminiKeyOrProxy
    }

    return ""
  }

  return {
    gptModels,
    geminiModels,
    handleSelectModel,
    getModelStatus,
  }
}
