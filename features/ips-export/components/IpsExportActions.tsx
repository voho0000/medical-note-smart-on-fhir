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
}

/**
 * Download / Copy actions plus the (Phase 1: stubbed) LLM-augmentation toggle.
 * The toggle is rendered but disabled so users can see the upcoming capability;
 * it is wired up in a later phase.
 */
export function IpsExportActions({ onDownload, onCopy, copied, copyError, disabled }: IpsExportActionsProps) {
  const { t } = useLanguage()
  const x = t.ipsExport

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
        </div>
        <Switch checked={false} disabled aria-label={x.llmToggleLabel} />
      </div>
    </div>
  )
}
