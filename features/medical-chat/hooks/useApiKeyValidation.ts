// API Key Validation Hook
import { useCallback } from 'react'
import type { OpenAiCompatibleConfig } from '@/src/shared/types/openai-compatible.types'
import { hasDirectModelAccess } from '@/src/shared/utils/model-access.utils'

export function useApiKeyValidation(
  model: string,
  openAiKey: string | null,
  geminiKey: string | null,
  claudeKey: string | null,
  openAiCompatible: OpenAiCompatibleConfig | null,
) {
  const hasApiKey = useCallback(() => {
    return hasDirectModelAccess(
      model,
      { openAiKey, geminiKey, claudeKey },
      openAiCompatible,
    )
  }, [model, openAiKey, geminiKey, claudeKey, openAiCompatible])

  return { hasApiKey }
}
