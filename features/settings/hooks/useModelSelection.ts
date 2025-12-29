// Custom Hook: Model Selection Logic
import { useMemo } from 'react'
import { useLanguage } from '@/src/application/providers/language.provider'
import {
  BUILT_IN_MODELS,
  GEMINI_MODELS,
  PREMIUM_MODELS,
  DEFAULT_MODEL_ID,
  getModelDefinition,
  isModelId,
  ModelDefinition,
} from "@/src/shared/constants/ai-models.constants"
import { hasChatProxy, hasGeminiProxy } from "@/src/shared/config/env.config"

export function useModelSelection(
  apiKey: string | null,
  geminiKey: string | null,
  model: string,
  setModel: (model: string) => void
) {
  const { t } = useLanguage()
  const gptModels = useMemo(() => {
    const models = [...BUILT_IN_MODELS, ...PREMIUM_MODELS]
    return models.filter((entry) => {
      const definition = getModelDefinition(entry.id)
      if (!definition) return false
      if (definition.requiresUserKey && !apiKey) return false
      return true
    })
  }, [apiKey])

  const geminiModels = useMemo(() => {
    return GEMINI_MODELS.filter((entry) => {
      const definition = getModelDefinition(entry.id)
      if (!definition) return false
      if (definition.requiresUserKey && !geminiKey) return false
      return true
    })
  }, [geminiKey])

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
