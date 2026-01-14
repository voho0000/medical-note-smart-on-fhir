// Refactored Model and Key Settings Component
"use client"

import { useEffect, useState } from "react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAiConfigStore } from "@/src/application/stores/ai-config.store"
import { Label } from "@/components/ui/label"
import { DEFAULT_MODEL_ID, getModelDefinition } from "@/src/shared/constants/ai-models.constants"
import { hasChatProxy, hasGeminiProxy } from "@/src/shared/config/env.config"
import { useModelSelection as useModelSelectionLogic } from '../hooks/useModelSelection'
import { ModelSelector } from './ModelSelector'
import { ApiKeyInput } from './ApiKeyInput'
import { AuthStatus } from '@/features/auth'

export function ModelAndKeySettings() {
  const { t } = useLanguage()
  const apiKey = useAiConfigStore((state) => state.apiKey)
  const geminiKey = useAiConfigStore((state) => state.geminiKey)
  const perplexityKey = useAiConfigStore((state) => state.perplexityKey)
  const model = useAiConfigStore((state) => state.model)
  const setApiKey = useAiConfigStore((state) => state.setApiKey)
  const setGeminiKey = useAiConfigStore((state) => state.setGeminiKey)
  const setPerplexityKey = useAiConfigStore((state) => state.setPerplexityKey)
  const setModel = useAiConfigStore((state) => state.setModel)
  const clearAllKeys = useAiConfigStore((state) => state.clearAllKeys)
  const [openAiValue, setOpenAiValue] = useState(apiKey)
  const [geminiValue, setGeminiValue] = useState(geminiKey)
  const [perplexityValue, setPerplexityValue] = useState(perplexityKey)

  useEffect(() => {
    setOpenAiValue(apiKey)
  }, [apiKey])

  useEffect(() => {
    setGeminiValue(geminiKey)
  }, [geminiKey])

  useEffect(() => {
    setPerplexityValue(perplexityKey)
  }, [perplexityKey])

  const { gptModels, geminiModels, handleSelectModel, getModelStatus } = useModelSelectionLogic(
    apiKey,
    geminiKey,
    model,
    setModel
  )

  const handleSaveOpenAiKey = async () => {
    if (openAiValue) setApiKey(openAiValue.trim())
  }

  const handleClearOpenAiKey = () => {
    setOpenAiValue("")
    setApiKey(null)
    const definition = getModelDefinition(model)
    if (definition?.provider === "openai" && (definition.requiresUserKey || !hasChatProxy)) {
      setModel(DEFAULT_MODEL_ID)
    }
  }

  const handleSaveGeminiKey = async () => {
    setGeminiKey(geminiValue)
  }

  const handleClearGeminiKey = () => {
    setGeminiValue("")
    setGeminiKey(null)
    const definition = getModelDefinition(model)
    if (definition?.provider === "gemini" && !hasGeminiProxy) {
      setModel(DEFAULT_MODEL_ID)
    }
  }

  const handleSavePerplexityKey = async () => {
    if (perplexityValue) setPerplexityKey(perplexityValue.trim())
  }

  const handleClearPerplexityKey = () => {
    setPerplexityValue("")
    setPerplexityKey(null)
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

      {/* Authentication Status - Free Quota */}
      <AuthStatus />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            {t.common.or || '或'}
          </span>
        </div>
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
        clearWarning={t.settings.clearOpenAiKeyWarning}
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
        clearWarning={t.settings.clearGeminiKeyWarning}
      />

      {/* Perplexity API Key */}
      <ApiKeyInput
        id="perplexity-key"
        label={t.settings.personalPerplexityKey}
        placeholder="pplx-..."
        value={perplexityValue || ''}
        onChange={setPerplexityValue}
        onSave={handleSavePerplexityKey}
        onClear={handleClearPerplexityKey}
        helpText={t.settings.perplexityKeyHelp}
        clearWarning={t.settings.clearPerplexityKeyWarning}
      />
    </div>
  )
}
