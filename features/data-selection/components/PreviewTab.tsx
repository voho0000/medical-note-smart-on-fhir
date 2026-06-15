"use client"

import { toast } from "sonner"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useDataSelection } from "@/src/application/providers/data-selection.provider"
import { useCopyToClipboard } from "@/src/shared/hooks/use-copy-to-clipboard"

// One-tap copy of the formatted clinical context (mirrors the insight/chat
// copy buttons — same hook + Copy/Check feedback).
function CopyContextButton({ text }: { text: string }) {
  const { t } = useLanguage()
  const { copied, copy } = useCopyToClipboard()
  const handleCopy = async () => {
    const ok = await copy(text)
    if (!ok) toast.error(t.common.copyFailed)
  }
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      disabled={!text.trim()}
      className="h-7 gap-1 px-2 text-xs"
      aria-label={copied ? t.common.copied : t.common.copy}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? t.common.copied : t.common.copy}
    </Button>
  )
}

interface PreviewTabProps {
  supplementaryNotes: string
  onSupplementaryNotesChange: (notes: string) => void
  editedClinicalContext: string | null
  onEditedClinicalContextChange: (context: string) => void
  formattedClinicalContext: string
  onReset: () => void
}

export function PreviewTab({
  supplementaryNotes,
  onSupplementaryNotesChange,
  editedClinicalContext,
  onEditedClinicalContextChange,
  formattedClinicalContext,
  onReset,
}: PreviewTabProps) {
  const { t } = useLanguage()
  const { editingConsumer } = useDataSelection()
  const ds = t.dataSelection as unknown as Record<string, string>
  const consumerLabel =
    editingConsumer === 'chat' ? (ds.consumerChat ?? '對話') :
    editingConsumer === 'insights' ? (ds.consumerInsights ?? '洞察') :
    (ds.consumerIps ?? 'IPS')
  const isIps = editingConsumer === 'ips'

  return (
    <div className="space-y-3">
      {/* Which consumer this preview reflects */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{ds.previewFor ?? '預覽'}</span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">{consumerLabel}</span>
      </div>

      {isIps ? (
        // IPS uses structured curation — the text edit + supplementary notes
        // don't apply. Show a read-only preview of the data that will be included.
        <>
          <p className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            {ds.ipsPreviewNote}
          </p>
          <div className="flex justify-end">
            <CopyContextButton text={formattedClinicalContext} />
          </div>
          <Textarea
            value={formattedClinicalContext}
            readOnly
            className="min-h-[300px] bg-muted/20 font-mono text-xs"
            placeholder={ds.noDataSelected}
          />
        </>
      ) : (
        <>
          <div className="space-y-1">
            <h3 className="text-sm font-medium">{ds.supplementaryNotes}</h3>
            <p className="text-xs text-muted-foreground">{ds.supplementaryNotesDescription}</p>
          </div>
          <Textarea
            value={supplementaryNotes}
            onChange={(e) => onSupplementaryNotesChange(e.target.value)}
            className="min-h-[100px] font-mono text-sm"
            placeholder={ds.supplementaryNotesPlaceholder}
          />
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-0.5">
              <h3 className="text-sm font-medium">{ds.formattedClinicalContext}</h3>
              <p className="text-xs text-muted-foreground">{ds.formattedClinicalContextDescription}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <CopyContextButton text={editedClinicalContext ?? formattedClinicalContext} />
              <Button
                variant="outline"
                size="sm"
                onClick={onReset}
                disabled={!editedClinicalContext}
                className="h-7 px-2 text-xs"
              >
                {ds.resetToDefault}
              </Button>
            </div>
          </div>
          <Textarea
            value={editedClinicalContext ?? formattedClinicalContext}
            onChange={(e) => onEditedClinicalContextChange(e.target.value)}
            className="min-h-[250px] font-mono text-sm"
            placeholder={ds.noDataSelected}
          />
        </>
      )}
    </div>
  )
}
