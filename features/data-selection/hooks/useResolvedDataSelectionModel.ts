"use client"

import { useAllApiKeys } from "@/src/application/stores/ai-config.store"
import { useEffectiveModel } from "@/src/application/stores/model-prefs.store"
import { gateModelForKeys } from "@/src/shared/constants/ai-models.constants"
import {
  isOpenAiCompatibleRuntimeReady,
  resolveOpenAiCompatibleProfile,
} from "@/src/shared/utils/openai-compatible.utils"
import {
  modelContextLimit,
  modelDisplayLabel,
} from "@/src/shared/utils/model-access.utils"

export function useResolvedDataSelectionModel(
  modelId?: string,
  fallbackModelId?: string,
) {
  const defaultModelId = useEffectiveModel("insights")
  const {
    apiKey,
    geminiKey,
    claudeKey,
    openAiCompatibleProfiles,
  } = useAllApiKeys()
  const preferredModelId = modelId ?? defaultModelId
  const selectedOpenAiCompatible = resolveOpenAiCompatibleProfile(
    preferredModelId,
    openAiCompatibleProfiles,
  )
  // useEffectiveModel already key-gates the default. An explicit model comes
  // from the embedding summary surface and must be gated against its own
  // fallback here.
  const effectiveModelId = modelId
    ? gateModelForKeys(
        preferredModelId,
        {
          openAiKey: apiKey,
          geminiKey,
          claudeKey,
          customAvailable: isOpenAiCompatibleRuntimeReady(selectedOpenAiCompatible),
        },
        fallbackModelId ?? defaultModelId,
      )
    : defaultModelId
  const openAiCompatible = resolveOpenAiCompatibleProfile(
    effectiveModelId,
    openAiCompatibleProfiles,
  )

  return {
    modelId: effectiveModelId,
    openAiCompatible,
    contextLimit: modelContextLimit(effectiveModelId, openAiCompatible),
    modelLabel: modelDisplayLabel(effectiveModelId, openAiCompatible),
  }
}
