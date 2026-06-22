// In-panel model picker for the Safety Alerts scan. Independent of the chat /
// insights model — it reads/writes the safety-specific preference. Reuses the
// shared model-selection logic so key-gating (premium models locked unless the
// user's provider key is present) matches the chat selector exactly.
"use client"

import { Check, ChevronDown, Lock } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAllApiKeys } from "@/src/application/stores/ai-config.store"
import { useModelSelection, type ModelEntry } from "@/src/application/hooks/useModelSelection"
import { getModelDefinition } from "@/src/shared/constants/ai-models.constants"

interface SafetyModelPickerProps {
  model: string
  onSelectModel: (id: string) => void
}

export function SafetyModelPicker({ model, onSelectModel }: SafetyModelPickerProps) {
  const { t } = useLanguage()
  const { apiKey, geminiKey, claudeKey } = useAllApiKeys()
  const { gptModels, geminiModels, claudeModels, handleSelectModel } = useModelSelection(
    apiKey,
    geminiKey,
    claudeKey,
    model,
    onSelectModel,
  )

  const currentLabel = getModelDefinition(model)?.label ?? model
  const groups: Array<{ label: string; items: ModelEntry[] }> = [
    { label: "Gemini", items: geminiModels },
    { label: "GPT", items: gptModels },
    { label: "Claude", items: claudeModels },
  ]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={t.safetyAlerts.modelTooltip}
          className="flex items-center gap-1 whitespace-nowrap rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
        >
          {t.safetyAlerts.modelLabel}：<span className="font-medium text-foreground">{currentLabel}</span>
          <ChevronDown className="h-3 w-3 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[60vh] w-60 overflow-y-auto">
        {groups.map((group, groupIndex) => (
          <div key={group.label}>
            {groupIndex > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
              {group.label}
            </DropdownMenuLabel>
            {group.items.map((entry) => (
              <DropdownMenuItem
                key={entry.id}
                disabled={entry.isLocked}
                onClick={() => handleSelectModel(entry.id)}
                className="cursor-pointer gap-2 text-xs"
              >
                <span className="flex-1 truncate">{entry.label}</span>
                {entry.isLocked ? (
                  <Lock className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                ) : model === entry.id ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
