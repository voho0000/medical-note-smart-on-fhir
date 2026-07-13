"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useCopyToClipboard } from "@/src/shared/hooks/use-copy-to-clipboard"

interface PreviewTabProps {
  formattedClinicalContext: string
  maskedClinicalContext: string
}

export function PreviewTab({ formattedClinicalContext, maskedClinicalContext }: PreviewTabProps) {
  const { t } = useLanguage()
  const ds = t.dataSelection as unknown as Record<string, string>
  const { copied, copy } = useCopyToClipboard()
  // Copy-to-external-AI is the original purpose of this preview. Default to
  // the same outbound PII scrub used by in-app AI; raw export is still possible
  // but requires an explicit user action in this tab.
  const [maskIdentifiers, setMaskIdentifiers] = useState(true)
  const textToCopy = maskIdentifiers ? maskedClinicalContext : formattedClinicalContext
  const preview = textToCopy.trim()

  const handleCopy = async () => {
    const ok = await copy(textToCopy)
    if (!ok) toast.error(t.common.copyFailed)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">{ds.formattedClinicalContext}</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {ds.formattedClinicalContextDescription}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          disabled={!preview}
          className="h-7 shrink-0 gap-1 px-2 text-xs"
          aria-label={copied ? t.common.copied : t.common.copy}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? t.common.copied : t.common.copy}
        </Button>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2">
        <div>
          <label htmlFor="mask-clinical-identifiers" className="text-xs font-medium">
            {ds.maskIdentifiers}
          </label>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {maskIdentifiers ? ds.maskIdentifiersOn : ds.maskIdentifiersOff}
          </p>
        </div>
        <Switch
          id="mask-clinical-identifiers"
          checked={maskIdentifiers}
          onCheckedChange={setMaskIdentifiers}
          aria-label={ds.maskIdentifiers}
        />
      </div>
      <pre
        data-testid="clinical-context-preview"
        className="min-h-[250px] overflow-x-auto whitespace-pre-wrap break-words rounded-md border bg-muted/20 p-3 font-mono text-xs leading-relaxed text-foreground"
      >
        {preview || ds.noDataSelected}
      </pre>
    </div>
  )
}
