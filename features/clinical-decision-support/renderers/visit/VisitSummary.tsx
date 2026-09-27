"use client"

import { Check, ChevronDown, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useCopyToClipboard } from '@/src/shared/hooks/use-copy-to-clipboard'

/**
 * 本次摘要: the visit in a few lines, copied in one press. The text is built by
 * `buildVisitSummaryText` from the pack's own wording and today's decisions,
 * and follows every answer and decision above it as they change.
 */
export function VisitSummary({ text, isEnglish }: { text: string; isEnglish: boolean }) {
  const { copied, copy } = useCopyToClipboard()
  const onCopy = async () => {
    const ok = await copy(text)
    if (!ok) {
      toast.error(isEnglish
        ? 'Could not copy — the clipboard is unavailable in this context.'
        : '無法複製，此環境無法使用剪貼簿。')
    }
  }
  return (
    <section aria-labelledby="cdss-visit-summary-title" className="space-y-2 border-t border-border pt-3" data-testid="cdss-visit-summary">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 id="cdss-visit-summary-title" className="text-sm font-semibold text-foreground">
          {isEnglish ? 'This visit' : '本次摘要'}
        </h3>
        <Button
          type="button"
          variant="outline"
          className="ml-auto h-11 gap-1.5 px-3 shadow-none"
          onClick={onCopy}
          data-testid="cdss-visit-summary-copy"
        >
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied
            ? (isEnglish ? 'Copied' : '已複製')
            : (isEnglish ? 'Copy summary' : '複製本次摘要')}
        </Button>
      </div>
      {/* The copy is what the visit needs; the text repeats the screen above,
          so its preview waits until asked for. */}
      <details className="group/summary rounded-md" data-testid="cdss-visit-summary-preview">
        <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open/summary:rotate-180" aria-hidden="true" />
          {isEnglish ? 'Preview' : '預覽摘要'}
        </summary>
        <p className="mt-1 whitespace-pre-line rounded-md bg-muted/40 px-3 py-2 text-xs leading-relaxed text-foreground" data-testid="cdss-visit-summary-text">
          {text}
        </p>
      </details>
    </section>
  )
}
