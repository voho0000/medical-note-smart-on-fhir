// Refactored Model and Key Settings Component
"use client"

import { useEffect, useState } from "react"
import { Info } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAiConfigStore } from "@/src/application/stores/ai-config.store"
import { Label } from "@/components/ui/label"
import { cn } from "@/src/shared/utils/cn.utils"
import { DEFAULT_MODEL_ID, getModelDefinition, type ModelProvider } from "@/src/shared/constants/ai-models.constants"
import { hasChatProxy, hasGeminiProxy, hasClaudeProxy } from "@/src/shared/config/env.config"
import { useModelSelection as useModelSelectionLogic } from '../hooks/useModelSelection'
import { ModelSelector } from './ModelSelector'
import { ApiKeyInput } from './ApiKeyInput'
import { AuthStatus } from '@/features/auth'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function ModelAndKeySettings() {
  const { t } = useLanguage()
  const apiKey = useAiConfigStore((state) => state.apiKey)
  const geminiKey = useAiConfigStore((state) => state.geminiKey)
  const perplexityKey = useAiConfigStore((state) => state.perplexityKey)
  const claudeKey = useAiConfigStore((state) => state.claudeKey)
  const model = useAiConfigStore((state) => state.model)
  const setApiKey = useAiConfigStore((state) => state.setApiKey)
  const setGeminiKey = useAiConfigStore((state) => state.setGeminiKey)
  const setPerplexityKey = useAiConfigStore((state) => state.setPerplexityKey)
  const setClaudeKey = useAiConfigStore((state) => state.setClaudeKey)
  const setModel = useAiConfigStore((state) => state.setModel)
  const clearAllKeys = useAiConfigStore((state) => state.clearAllKeys)
  const [openAiValue, setOpenAiValue] = useState(apiKey)
  const [geminiValue, setGeminiValue] = useState(geminiKey)
  const [perplexityValue, setPerplexityValue] = useState(perplexityKey)
  const [claudeValue, setClaudeValue] = useState(claudeKey)

  useEffect(() => {
    setOpenAiValue(apiKey)
  }, [apiKey])

  useEffect(() => {
    setGeminiValue(geminiKey)
  }, [geminiKey])

  useEffect(() => {
    setPerplexityValue(perplexityKey)
  }, [perplexityKey])

  useEffect(() => {
    setClaudeValue(claudeKey)
  }, [claudeKey])

  const { gptModels, geminiModels, claudeModels, handleSelectModel, getModelStatus } = useModelSelectionLogic(
    apiKey,
    geminiKey,
    claudeKey,
    model,
    setModel
  )

  // Show one provider's models at a time (was 12 cards stacked). The visible
  // provider follows the currently-selected model, but the user can browse
  // other providers without changing their selection.
  const PROVIDER_TABS: Array<{ id: ModelProvider; label: string }> = [
    { id: "openai", label: "GPT" },
    { id: "gemini", label: "Gemini" },
    { id: "claude", label: "Claude" },
  ]
  const selectedProvider = getModelDefinition(model)?.provider ?? "openai"
  const [activeProvider, setActiveProvider] = useState<ModelProvider>(selectedProvider)
  // Keep the visible tab in sync when the model changes elsewhere
  useEffect(() => {
    setActiveProvider(selectedProvider)
  }, [selectedProvider])

  const modelsByProvider: Record<ModelProvider, typeof gptModels> = {
    openai: gptModels,
    gemini: geminiModels,
    claude: claudeModels,
  }

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

  const handleSaveClaudeKey = async () => {
    if (claudeValue) setClaudeKey(claudeValue.trim())
  }

  const handleClearClaudeKey = () => {
    setClaudeValue("")
    setClaudeKey(null)
    const definition = getModelDefinition(model)
    if (definition?.provider === "claude" && (definition.requiresUserKey || !hasClaudeProxy)) {
      setModel(DEFAULT_MODEL_ID)
    }
  }

  const handleClearPerplexityKey = () => {
    setPerplexityValue("")
    setPerplexityKey(null)
  }

  return (
    <div className="space-y-6">
      {/* Model Selection */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Label className="text-xs uppercase text-muted-foreground">{t.settings.generationModel}</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground/70 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">{t.settings.modelProxyNote}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="space-y-3">
          {/* Provider tabs */}
          <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
            {PROVIDER_TABS.map((tab) => {
              const isActive = activeProvider === tab.id
              const hasSelected = selectedProvider === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveProvider(tab.id)}
                  className={cn(
                    "relative rounded-md px-3 py-1.5 text-sm font-medium transition",
                    isActive
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                  {/* dot marks the provider holding the active model */}
                  {hasSelected && (
                    <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" />
                  )}
                </button>
              )
            })}
          </div>

          <ModelSelector
            models={modelsByProvider[activeProvider]}
            selectedModel={model}
            onSelectModel={handleSelectModel}
            getModelStatus={getModelStatus}
          />
        </div>
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

      {/* Claude API Key */}
      <ApiKeyInput
        id="claude-key"
        label={t.settings.personalClaudeKey}
        placeholder="sk-ant-..."
        value={claudeValue || ''}
        onChange={setClaudeValue}
        onSave={handleSaveClaudeKey}
        onClear={handleClearClaudeKey}
        helpText={t.settings.claudeKeyHelp}
        clearWarning={t.settings.clearClaudeKeyWarning}
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
