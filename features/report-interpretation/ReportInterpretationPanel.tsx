// The inline translation + interpretation card. Rendered directly BELOW the
// report body (never a modal, never a jump to another panel) so the original
// stays on screen and the patient can read the two side by side. Auto-generates
// on first mount — the host only mounts this once the user opens it, so mounting
// == the user asked for it (no wasted quota).
//
// Two visually distinct regions on purpose:
//   1. 中文翻譯 (中性、忠實) — the faithful translation, source of truth.
//   2. 白話解讀 (AI 詮釋) — plain-language explanation.
// A fixed disclaimer sits at the foot and is never collapsible.
'use client'

import { useEffect } from 'react'
import { Languages, Sparkles, Loader2, RotateCw, AlertTriangle, Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/src/shared/utils/cn.utils'
import { useLanguage } from '@/src/application/providers/language.provider'
import { MarkdownRenderer } from '@/src/shared/components/MarkdownRenderer'
import {
  useReportInterpretation,
  type UseReportInterpretationArgs,
} from '@/src/application/hooks/report-interpretation/use-report-interpretation.hook'

type Labels = ReturnType<typeof getLabels>
function getLabels(locale: string) {
  const zh = locale === 'zh-TW'
  return {
    translationHeading: zh ? '翻譯' : 'Translation',
    interpretHeading: zh ? '白話解讀' : 'Plain-language explanation',
    summaryLabel: zh ? '這份報告在檢查什麼' : 'What this report checks',
    findingsLabel: zh ? '主要發現' : 'Key findings',
    watchForLabel: zh ? '可以留意的地方' : 'Worth keeping an eye on',
    generating: zh ? 'AI 翻譯與解讀中…' : 'Translating and explaining…',
    trigger: zh ? 'AI 翻譯解讀' : 'AI translate & explain',
    regenerate: zh ? '重新產生' : 'Regenerate',
    copy: zh ? '複製' : 'Copy',
    copied: zh ? '已複製' : 'Copied',
    truncated: zh
      ? '報告較長，僅翻譯與解讀了前半部內容。'
      : 'This report is long — only the first part was translated and explained.',
    error: zh
      ? 'AI 產生失敗，請稍後再試一次。'
      : 'AI generation failed. Please try again in a moment.',
    disclaimer: zh
      ? '本翻譯與解讀由 AI 產生，可能有誤，僅供幫助理解；報告的正確意義與後續處置，請以您的醫師解釋為準。'
      : 'This translation and explanation is AI-generated, may contain errors, and is only to aid understanding; for the correct meaning of the report and any next steps, defer to your doctor’s explanation.',
  }
}

interface ReportInterpretationPanelProps extends UseReportInterpretationArgs {
  className?: string
  /** When true (default) the panel generates on mount — right for the inline
   *  host, which mounts the panel only after the user clicks the button (mount
   *  == intent). Set false for the 向右展開 right-pane host, which mounts the
   *  panel whenever a report is docked: there we must NOT auto-spend quota just
   *  because someone opened a report to read it. In manual mode the panel still
   *  SHOWS a result that was already generated elsewhere (shared per-reportId
   *  cache), but if none exists it shows a trigger button instead of generating. */
  autoGenerate?: boolean
}

export function ReportInterpretationPanel(props: ReportInterpretationPanelProps) {
  const { className, autoGenerate = true, ...hookArgs } = props
  const { locale } = useLanguage()
  const labels = getLabels(locale)
  const { result, isGenerating, error, generate, regenerate } = useReportInterpretation(hookArgs)

  // Auto-generate on mount only in auto mode. generate() is a no-op if a cached
  // result already exists for this key, so this never double-bills.
  useEffect(() => {
    if (autoGenerate) void generate()
  }, [autoGenerate, generate])

  // Manual mode with nothing yet to show: a compact trigger button instead of
  // the full card, so docking a report to the right pane doesn't auto-spend an
  // AI call. Once generated (here or inline) the shared cache fills `result`.
  const showTriggerOnly = !autoGenerate && !result && !isGenerating && !error
  if (showTriggerOnly) {
    return (
      <div className={cn('my-2', className)}>
        <button
          type="button"
          onClick={() => void generate()}
          className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/[0.04] px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        >
          <Languages className="h-3.5 w-3.5" />
          {labels.trigger}
        </button>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'my-2 rounded-lg border border-primary/25 bg-primary/[0.03] px-3 py-2.5',
        className,
      )}
    >
      {isGenerating && !result && (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {labels.generating}
        </div>
      )}

      {error && !isGenerating && (
        <div className="flex items-center justify-between gap-2 py-1.5">
          <span className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {labels.error}
          </span>
          <button
            type="button"
            onClick={() => void regenerate()}
            className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground hover:text-primary"
          >
            <RotateCw className="h-3 w-3" />
            {labels.regenerate}
          </button>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {result.truncated && (
            <div className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[0.6875rem] leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {labels.truncated}
            </div>
          )}

          {/* Region 1 — faithful translation */}
          <section>
            <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-foreground/80">
              <Languages className="h-3.5 w-3.5 text-primary" />
              {labels.translationHeading}
            </h4>
            <div className="text-sm leading-relaxed text-foreground/90">
              <MarkdownRenderer content={result.translation} />
            </div>
          </section>

          {/* Region 2 — plain-language interpretation, visually distinct */}
          <section className="rounded-md border border-border/60 bg-background/60 px-2.5 py-2">
            <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground/80">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              {labels.interpretHeading}
            </h4>
            <div className="space-y-2">
              <Field label={labels.summaryLabel} text={result.summary} />
              <Field label={labels.findingsLabel} markdown={result.findings} />
              {result.watchFor && <Field label={labels.watchForLabel} text={result.watchFor} />}
            </div>
          </section>

          <FooterBar labels={labels} result={result} onRegenerate={() => void regenerate()} />
        </div>
      )}

      {/* Disclaimer — always shown once there's a result, never collapsible. */}
      {result && (
        <p className="mt-2 border-t border-border/50 pt-1.5 text-[0.625rem] leading-relaxed text-muted-foreground">
          {labels.disclaimer}
        </p>
      )}
    </div>
  )
}

function Field({ label, text, markdown }: { label: string; text?: string; markdown?: string }) {
  return (
    <div>
      <p className="mb-0.5 text-[0.6875rem] font-medium text-muted-foreground">{label}</p>
      {markdown ? (
        <div className="text-sm leading-relaxed text-foreground/90">
          <MarkdownRenderer content={markdown} />
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-foreground/90">{text}</p>
      )}
    </div>
  )
}

function FooterBar({
  labels,
  result,
  onRegenerate,
}: {
  labels: Labels
  result: { translation: string; summary: string; findings: string; watchFor?: string }
  onRegenerate: () => void
}) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    const parts = [
      `【${labels.translationHeading}】\n${result.translation}`,
      `【${labels.summaryLabel}】\n${result.summary}`,
      `【${labels.findingsLabel}】\n${result.findings}`,
      result.watchFor ? `【${labels.watchForLabel}】\n${result.watchFor}` : '',
    ].filter(Boolean)
    try {
      await navigator.clipboard.writeText(parts.join('\n\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.warn('[ReportInterpretation] copy failed', err)
    }
  }
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? labels.copied : labels.copy}
      </button>
      <button
        type="button"
        onClick={onRegenerate}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
      >
        <RotateCw className="h-3 w-3" />
        {labels.regenerate}
      </button>
    </div>
  )
}
