// Custom Hook: Model Selection Logic
import { useMemo } from 'react'
import { toast } from 'sonner'
import { useLanguage } from '@/src/application/providers/language.provider'
import {
  GPT_MODELS,
  GEMINI_MODELS,
  CLAUDE_MODELS,
  getModelDefinition,
  isModelId,
  ModelDefinition,
} from "@/src/shared/constants/ai-models.constants"
import { hasChatProxy, hasGeminiProxy, hasClaudeProxy } from "@/src/shared/config/env.config"

export interface ModelEntry {
  id: string
  label: string
  description: string
  isLocked: boolean
}

export function useModelSelection(
  apiKey: string | null,
  geminiKey: string | null,
  claudeKey: string | null,
  model: string,
  setModel: (model: string) => void
) {
  const { t } = useLanguage()
  const gptModels = useMemo(() => {
    return GPT_MODELS.map((entry): ModelEntry => {
      const definition = getModelDefinition(entry.id)
      const isLocked = definition?.disabled || (definition?.requiresUserKey && !apiKey)
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
      const isLocked = definition?.disabled || (definition?.requiresUserKey && !geminiKey)
      const description = t.settings.modelDescriptions[entry.id as keyof typeof t.settings.modelDescriptions] || ''
      return {
        id: entry.id,
        label: entry.label,
        description,
        isLocked: isLocked || false
      }
    })
  }, [geminiKey, t.settings.modelDescriptions])

  const claudeModels = useMemo(() => {
    return CLAUDE_MODELS.map((entry): ModelEntry => {
      const definition = getModelDefinition(entry.id)
      const isLocked = definition?.disabled || (definition?.requiresUserKey && !claudeKey)
      const description = t.settings.modelDescriptions[entry.id as keyof typeof t.settings.modelDescriptions] || ''
      return {
        id: entry.id,
        label: entry.label,
        description,
        isLocked: isLocked || false
      }
    })
  }, [claudeKey, t.settings.modelDescriptions])

  const handleSelectModel = (candidate: string) => {
    if (!isModelId(candidate)) return
    const definition = getModelDefinition(candidate)
    if (!definition) return

    if (definition.disabled) {
      toast.error(t.settings.modelUnavailable)
      return
    }

    if (definition.provider === "openai" && definition.requiresUserKey && !apiKey) {
      toast.error(t.settings.requiresOpenAiKey)
      return
    }

    if (definition.provider === "openai" && !definition.requiresUserKey && !apiKey && !hasChatProxy) {
      toast.error(t.settings.requiresProxyOrOpenAiKey)
      return
    }

    if (definition.provider === "gemini" && !geminiKey && !hasGeminiProxy) {
      toast.error(t.settings.requiresGeminiKeyOrProxy)
      return
    }

    if (definition.provider === "claude" && definition.requiresUserKey && !claudeKey) {
      toast.error(t.settings.requiresClaudeKey)
      return
    }

    if (definition.provider === "claude" && !definition.requiresUserKey && !claudeKey && !hasClaudeProxy) {
      toast.error(t.settings.requiresClaudeKeyOrProxy)
      return
    }

    setModel(candidate)
  }

  const getModelStatus = (definition: ModelDefinition) => {
    if (definition.disabled) return t.settings.modelUnavailable

    if (definition.provider === "openai") {
      if (definition.requiresUserKey) {
        return apiKey ? t.settings.usingPersonalOpenAiKey : t.settings.requiresOpenAiKey
      }
      if (apiKey) return t.settings.willUsePersonalOpenAiKey
      if (hasChatProxy) return t.settings.routedViaProxy
      return t.settings.requiresProxyOrOpenAiKey
    }

    if (definition.provider === "gemini") {
      if (definition.requiresUserKey) {
        return geminiKey ? t.settings.usingPersonalGeminiKey : t.settings.requiresGeminiKey
      }
      if (geminiKey) return t.settings.usingPersonalGeminiKey
      if (hasGeminiProxy) return t.settings.routedViaProxy
      return t.settings.requiresGeminiKeyOrProxy
    }

    if (definition.provider === "claude") {
      if (definition.requiresUserKey) {
        return claudeKey ? t.settings.usingPersonalClaudeKey : t.settings.requiresClaudeKey
      }
      if (claudeKey) return t.settings.usingPersonalClaudeKey
      if (hasClaudeProxy) return t.settings.routedViaProxy
      return t.settings.requiresClaudeKeyOrProxy
    }

    return ""
  }

  return {
    gptModels,
    geminiModels,
    claudeModels,
    handleSelectModel,
    getModelStatus,
  }
}
