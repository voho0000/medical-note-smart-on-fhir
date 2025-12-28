// features/medical-note/components/ApiKeyField.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { useApiKey } from "@/lib/providers/ApiKeyProvider"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { useNote } from "../providers/NoteProvider"
import {
  BUILT_IN_MODELS,
  GEMINI_MODELS,
  PREMIUM_MODELS,
  DEFAULT_MODEL_ID,
  getModelDefinition,
  isModelId,
  ModelDefinition,
} from "@/features/medical-note/constants/models"
import { hasChatProxy, hasGeminiProxy } from "@/lib/config/ai"

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

  const availableModels = useMemo(() => {
    const base: ModelDefinition[] = [...BUILT_IN_MODELS, ...GEMINI_MODELS]
    if (apiKey) {
      base.push(...PREMIUM_MODELS)
    }
    return base
  }, [apiKey])

  const handleSelectModel = (candidate: string) => {
    if (!isModelId(candidate)) return
    const definition = getModelDefinition(candidate)
    if (!definition) return

    if (definition.provider === "openai" && definition.requiresUserKey && !apiKey) {
      alert("Add an OpenAI API key to use premium GPT models.")
      return
    }

    if (definition.provider === "openai" && !definition.requiresUserKey && !apiKey && !hasChatProxy) {
      alert("Configure the PrismaCare chat proxy or add your OpenAI key to use this model.")
      return
    }

    if (definition.provider === "gemini" && !geminiKey && !hasGeminiProxy) {
      alert("Add a Gemini API key or configure the PrismaCare Gemini proxy before using this model.")
      return
    }

    setModel(candidate)
  }

  const getModelStatus = (definition: ModelDefinition) => {
    if (definition.provider === "openai") {
      if (definition.requiresUserKey) {
        return apiKey ? "Using personal OpenAI key" : "Requires OpenAI API key"
      }
      if (apiKey) return "Will use personal OpenAI key"
      if (hasChatProxy) return "Routed via PrismaCare proxy"
      return "Requires proxy or OpenAI key"
    }

    if (definition.provider === "gemini") {
      if (geminiKey) return "Using personal Gemini key"
      if (hasGeminiProxy) return "Routed via PrismaCare Gemini proxy"
      return "Requires Gemini key or proxy"
    }

    return ""
  }

  const handleSaveOpenAiKey = () => {
    setApiKey(openAiValue.trim())
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
    setGeminiKey(geminiValue.trim())
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
      <div className="space-y-2">
        <Label className="text-xs uppercase text-muted-foreground">Generation Model</Label>
        <div className="flex flex-wrap gap-2">
          {availableModels.map((entry) => {
            const isActive = model === entry.id
            const definition = getModelDefinition(entry.id)
            const status = definition ? getModelStatus(definition) : ""
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => handleSelectModel(entry.id)}
                className={cn(
                  "h-auto min-w-[140px] flex-1 rounded-md border px-3 py-2 text-left text-xs transition",
                  isActive
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-background hover:border-primary/40",
                )}
              >
                <span className="block text-sm font-medium leading-tight">{entry.label}</span>
                <span className="text-xs text-muted-foreground">{entry.description}</span>
                {status ? (
                  <span className="mt-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                    {status}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
        {!apiKey && (
          <p className="text-xs text-muted-foreground">
            Built-in GPT models use the PrismaCare proxy when no OpenAI key is saved.
          </p>
        )}
        {!geminiKey && hasGeminiProxy && (
          <p className="text-xs text-muted-foreground">
            Gemini requests will route through the PrismaCare Gemini proxy unless you add your own key.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="openai-key" className="text-xs uppercase text-muted-foreground">
          Personal OpenAI API key (stored locally)
        </Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="openai-key"
            type="password"
            placeholder="sk-..."
            className="sm:flex-1"
            value={openAiValue}
            onChange={(event) => setOpenAiValue(event.target.value)}
          />
          <div className="flex gap-2 sm:w-auto">
            <Button size="sm" onClick={handleSaveOpenAiKey} disabled={!openAiValue.trim()}>
              Save key
            </Button>
            <Button size="sm" variant="outline" onClick={handleClearOpenAiKey}>
              Clear
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Leave blank to keep using PrismaCare&apos;s built-in GPT models. Keys never leave this browser unless you invoke OpenAI directly.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="gemini-key" className="text-xs uppercase text-muted-foreground">
          Personal Gemini API key (stored locally)
        </Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="gemini-key"
            type="password"
            placeholder="AIza..."
            className="sm:flex-1"
            value={geminiValue}
            onChange={(event) => setGeminiValue(event.target.value)}
          />
          <div className="flex gap-2 sm:w-auto">
            <Button size="sm" onClick={handleSaveGeminiKey} disabled={!geminiValue.trim()}>
              Save key
            </Button>
            <Button size="sm" variant="outline" onClick={handleClearGeminiKey}>
              Clear
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Without a Gemini key we will call the PrismaCare Gemini proxy when available. Your Gemini key is kept in local storage on this device only.
        </p>
      </div>
    </div>
  )
}