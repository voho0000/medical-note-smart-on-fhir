"use client"

import { Sparkles } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { useLanguage } from '@/src/application/providers/language.provider'

interface IpsInferenceControlsProps {
  /** Whether the AI problem-list inference panel is shown. */
  llmEnabled: boolean
  /** Toggle the inference panel on/off. */
  onToggleLlm: (next: boolean) => void
  /** False when no LLM provider is usable (no API key / proxy). */
  llmAvailable: boolean
}

/**
 * Live LLM problem-list inference toggle (Phase 2.2b). The inference result is
 * still deterministic once confirmed: checked suggestions become extra
 * conditions in the IPS snapshot; no LLM rewrites the export text.
 */
export function IpsInferenceControls({
  llmEnabled,
  onToggleLlm,
  llmAvailable,
}: IpsInferenceControlsProps) {
  const { t } = useLanguage()
  const x = t.ipsExport
  const p = x.inferredProblems

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2">
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="h-3.5 w-3.5 text-violet-500" />
          {x.llmToggleLabel}
        </div>
        {llmEnabled && <p className="text-xs text-muted-foreground">{x.llmToggleHint}</p>}
        {!llmAvailable && <p className="text-xs text-amber-700 dark:text-amber-400">{p.noKeyHint}</p>}
      </div>
      <Switch
        className="shrink-0"
        checked={llmEnabled}
        onCheckedChange={onToggleLlm}
        disabled={!llmAvailable}
        aria-label={x.llmToggleLabel}
        title={llmAvailable ? undefined : p.noKeyHint}
      />
    </div>
  )
}
