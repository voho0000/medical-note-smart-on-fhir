"use client"

import { toast } from "sonner"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useCopyToClipboard } from "@/src/shared/hooks/use-copy-to-clipboard"

interface PreviewTabProps {
  formattedClinicalContext: string
}

export function PreviewTab({ formattedClinicalContext }: PreviewTabProps) {
  const { t } = useLanguage()
  const ds = t.dataSelection as unknown as Record<string, string>
  const { copied, copy } = useCopyToClipboard()
  const preview = formattedClinicalContext.trim()

  const handleCopy = async () => {
    const ok = await copy(formattedClinicalContext)
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
      <pre
        data-testid="clinical-context-preview"
        className="min-h-[250px] overflow-x-auto whitespace-pre-wrap break-words rounded-md border bg-muted/20 p-3 font-mono text-xs leading-relaxed text-foreground"
      >
        {preview || ds.noDataSelected}
      </pre>
    </div>
  )
}
