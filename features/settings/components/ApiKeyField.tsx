// Refactored Model and Key Settings Component
"use client"

import { useEffect, useState } from "react"
import { useApiKey } from "@/src/application/providers/api-key.provider"
import { Label } from "@/components/ui/label"
import { useNote } from "@/src/application/providers/note.provider"
import { DEFAULT_MODEL_ID, getModelDefinition } from "@/src/shared/constants/ai-models.constants"
import { hasChatProxy, hasGeminiProxy } from "@/src/shared/config/env.config"
import { useModelSelection } from '../hooks/useModelSelection'
import { ModelSelector } from './ModelSelector'
import { ApiKeyInput } from './ApiKeyInput'

export function ModelAndKeySettings() {
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
        <Label className="text-xs uppercase text-muted-foreground">Generation Model</Label>
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
            Built-in GPT models use a Firebase Functions proxy when no OpenAI key is saved.
          </p>
        )}
        {!geminiKey && hasGeminiProxy && (
          <p className="text-xs text-muted-foreground">
            Gemini requests will route through a Firebase Functions proxy unless you add your own key.
          </p>
        )}
      </div>

      {/* OpenAI API Key */}
      <ApiKeyInput
        id="openai-key"
        label="Personal OpenAI API key (stored locally)"
        placeholder="sk-..."
        value={openAiValue || ''}
        onChange={setOpenAiValue}
        onSave={handleSaveOpenAiKey}
        onClear={handleClearOpenAiKey}
        helpText="Leave blank to use built-in GPT models via Firebase Functions proxy. Keys never leave this browser unless you invoke OpenAI directly."
      />

      {/* Gemini API Key */}
      <ApiKeyInput
        id="gemini-key"
        label="Personal Gemini API key (stored locally)"
        placeholder="AIza..."
        value={geminiValue || ''}
        onChange={setGeminiValue}
        onSave={handleSaveGeminiKey}
        onClear={handleClearGeminiKey}
        helpText="Without a Gemini key, requests will use the Firebase Functions proxy when available. Your Gemini key is kept in local storage on this device only."
      />
    </div>
  )
}
