// features/medical-note/components/ApiKeyField.tsx
"use client"

import { useMemo, useState } from "react"
import { useApiKey } from "@/lib/providers/ApiKeyProvider"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { useNote } from "../providers/NoteProvider"
import {
  BUILT_IN_MODELS,
  PREMIUM_MODELS,
  DEFAULT_MODEL_ID,
  isModelId,
  ModelId,
} from "@/features/medical-note/constants/models"

export function ModelAndKeySettings() {
  const { apiKey, setApiKey, clearApiKey } = useApiKey()
  const { model, setModel } = useNote()
  const [value, setValue] = useState(apiKey)

  const availableModels = useMemo(() => {
    return apiKey ? [...BUILT_IN_MODELS, ...PREMIUM_MODELS] : [...BUILT_IN_MODELS]
  }, [apiKey])

  const handleSelectModel = (candidate: string) => {
    if (isModelId(candidate)) {
      setModel(candidate)
    }
  }

  const handleSaveKey = () => {
    setApiKey(value.trim())
  }

  const handleClearKey = () => {
    setValue("")
    clearApiKey()
    if (!isModelId(model) || !BUILT_IN_MODELS.some((m) => m.id === (model as ModelId))) {
      setModel(DEFAULT_MODEL_ID)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs uppercase text-muted-foreground">Generation Model</Label>
        <div className="flex flex-wrap gap-2">
          {availableModels.map((entry) => {
            const isActive = model === entry.id
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => handleSelectModel(entry.id)}
                className={cn(
                  "h-auto min-w-[120px] flex-1 rounded-md border px-3 py-2 text-left text-xs transition",
                  isActive ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/40",
                )}
              >
                <span className="block font-medium text-sm leading-tight">{entry.label}</span>
                <span className="text-xs text-muted-foreground">{entry.description}</span>
              </button>
            )
          })}
        </div>
        {!apiKey && (
          <p className="text-xs text-muted-foreground">
            Using built-in models via PrismaCare proxy. Add a personal key to unlock premium OpenAI models.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="api-key" className="text-xs uppercase text-muted-foreground">
          Personal OpenAI API key (stored locally)
        </Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="api-key"
            type="password"
            placeholder="sk-..."
            className="sm:flex-1"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <div className="flex gap-2 sm:w-auto">
            <Button size="sm" onClick={handleSaveKey} disabled={!value.trim()}>
              Save key
            </Button>
            <Button size="sm" variant="outline" onClick={handleClearKey}>
              Clear
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Key is never sent to our servers unless you request OpenAI directly. Leave blank to use PrismaCare&apos;s base models.
        </p>
      </div>
    </div>
  )
}