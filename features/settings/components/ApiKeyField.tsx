// Refactored Model and Key Settings Component
"use client"

import { useEffect, useState } from "react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useApiKey } from "@/src/application/providers/api-key.provider"
import { Label } from "@/components/ui/label"
import { useNote } from "@/src/application/providers/note.provider"
import { DEFAULT_MODEL_ID, getModelDefinition } from "@/src/shared/constants/ai-models.constants"
import { hasChatProxy, hasGeminiProxy } from "@/src/shared/config/env.config"
import { useModelSelection } from '../hooks/useModelSelection'
import { ModelSelector } from './ModelSelector'
import { ApiKeyInput } from './ApiKeyInput'

export function ModelAndKeySettings() {
  const { t } = useLanguage()
  const { apiKey, setApiKey, clearApiKey, geminiKey, setGeminiKey, clearGeminiKey } = useApiKey()
  const { model, setModel } = useNote()
  const [openAiValue, setOpenAiValue] = useState(apiKey)
  const [geminiValue, setGeminiValue] = useState(geminiKey)

  useEffect(() => {
    setOpenAiValue(apiKey)
  }, [apiKey])

  useEffect(() => {
    setGeminiValue(geminiKey)
  }, [geminiKey])

  const { gptModels, geminiModels, handleSelectModel, getModelStatus } = useModelSelection(
    apiKey,
    geminiKey,
    model,
    setModel
  )

  const handleSaveOpenAiKey = () => {
    if (openAiValue) setApiKey(openAiValue.trim())
  }

  const handleClearOpenAiKey = () => {
    setOpenAiValue("")
    clearApiKey()
    const definition = getModelDefinition(model)
    if (definition?.provider === "openai" && (definition.requiresUserKey || !hasChatProxy)) {
      setModel(DEFAULT_MODEL_ID)
    }
  }

  const handleSaveGeminiKey = () => {
    if (geminiValue) setGeminiKey(geminiValue.trim())
  }

  const handleClearGeminiKey = () => {
    setGeminiValue("")
    clearGeminiKey()
    const definition = getModelDefinition(model)
    if (definition?.provider === "gemini" && !hasGeminiProxy) {
      setModel(DEFAULT_MODEL_ID)
    }
  }

  return (
    <div className="space-y-6">
      {/* Model Selection */}
      <div className="space-y-3">
        <Label className="text-xs uppercase text-muted-foreground">{t.settings.generationModel}</Label>
        <div className="space-y-2">
          <ModelSelector
            models={gptModels}
            selectedModel={model}
            onSelectModel={handleSelectModel}
            getModelStatus={getModelStatus}
          />
          <ModelSelector
            models={geminiModels}
            selectedModel={model}
            onSelectModel={handleSelectModel}
            getModelStatus={getModelStatus}
          />
        </div>
        {!apiKey && (
          <p className="text-xs text-muted-foreground">
            {t.settings.builtInGptNote}
          </p>
        )}
        {!geminiKey && hasGeminiProxy && (
          <p className="text-xs text-muted-foreground">
            {t.settings.geminiProxyNote}
          </p>
        )}
      </div>

      {/* OpenAI API Key */}
      <ApiKeyInput
        id="openai-key"
        label={t.settings.personalOpenAiKey}
        placeholder="sk-..."
        value={openAiValue || ''}
        onChange={setOpenAiValue}
        onSave={handleSaveOpenAiKey}
        onClear={handleClearOpenAiKey}
        helpText={t.settings.openAiKeyHelp}
      />

      {/* Gemini API Key */}
      <ApiKeyInput
        id="gemini-key"
        label={t.settings.personalGeminiKey}
        placeholder="AIza..."
        value={geminiValue || ''}
        onChange={setGeminiValue}
        onSave={handleSaveGeminiKey}
        onClear={handleClearGeminiKey}
        helpText={t.settings.geminiKeyHelp}
      />
    </div>
  )
}
