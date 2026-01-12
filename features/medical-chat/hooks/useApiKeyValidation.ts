// API Key Validation Hook
import { useCallback } from 'react'
import { getModelDefinition } from '@/src/shared/constants/ai-models.constants'

export function useApiKeyValidation(
  model: string,
  openAiKey: string | null,
  geminiKey: string | null
) {
  const hasApiKey = useCallback(() => {
    const modelDef = getModelDefinition(model)
    const provider = modelDef?.provider ?? "openai"
    return provider === "openai" ? !!openAiKey : !!geminiKey
  }, [model, openAiKey, geminiKey])

  return { hasApiKey }
}
