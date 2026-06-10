"use client"

import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Check, Copy, Download, Sparkles } from 'lucide-react'
import { useLanguage } from '@/src/application/providers/language.provider'

interface IpsExportActionsProps {
  onDownload: () => void
  onCopy: () => void
  copied: boolean
  copyError: string | null
  disabled: boolean
  /** Whether the AI problem-list inference panel is shown. */
  llmEnabled: boolean
  /** Toggle the inference panel on/off. */
  onToggleLlm: (next: boolean) => void
  /** False when no LLM provider is usable (no API key / proxy). */
  llmAvailable: boolean
}

/**
 * Download / Copy actions plus the live LLM problem-list inference toggle
 * (Phase 2.2b). When no provider is usable the toggle is disabled and a hint
 * points the user at the API-key settings.
 */
export function IpsExportActions({
  onDownload,
  onCopy,
  copied,
  copyError,
  disabled,
  llmEnabled,
  onToggleLlm,
  llmAvailable,
}: IpsExportActionsProps) {
  const { t } = useLanguage()
  const x = t.ipsExport
  const p = x.inferredProblems

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button onClick={onDownload} disabled={disabled} size="sm" className="flex-1">
          <Download className="mr-1.5 h-4 w-4" />
          {x.download}
        </Button>
        <Button onClick={onCopy} disabled={disabled} size="sm" variant="outline" className="flex-1">
          {copied ? <Check className="mr-1.5 h-4 w-4 text-emerald-600" /> : <Copy className="mr-1.5 h-4 w-4" />}
          {copied ? x.copied : x.copy}
        </Button>
      </div>
      {copyError && <p className="text-xs text-destructive">{copyError}</p>}

      <div className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Sparkles className="h-3.5 w-3.5 text-violet-500" />
            {x.llmToggleLabel}
          </div>
          <p className="text-xs text-muted-foreground">{x.llmToggleHint}</p>
          {!llmAvailable && <p className="text-xs text-amber-700 dark:text-amber-400">{p.noKeyHint}</p>}
        </div>
        <Switch
          checked={llmEnabled}
          onCheckedChange={onToggleLlm}
          disabled={!llmAvailable}
          aria-label={x.llmToggleLabel}
          title={llmAvailable ? undefined : p.noKeyHint}
        />
      </div>
    </div>
  )
}
