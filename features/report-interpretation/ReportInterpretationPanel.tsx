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

import { useEffect, useRef, useState } from 'react'
import { Languages, Sparkles, Loader2, RotateCw, AlertTriangle, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/src/shared/utils/cn.utils'
import { useLanguage } from '@/src/application/providers/language.provider'
import { isQuotaExceededError } from '@/src/core/errors'
import { useCopyToClipboard } from '@/src/shared/hooks/use-copy-to-clipboard'
import { MarkdownRenderer } from '@/src/shared/components/MarkdownRenderer'
import {
  useReportInterpretation,
  type UseReportInterpretationArgs,
} from '@/src/application/hooks/report-interpretation/use-report-interpretation.hook'
import { REPORT_INTERPRETATION_TOTAL_TIMEOUT_MS } from '@/src/application/hooks/report-interpretation/report-interpretation-timeout'

type Labels = ReturnType<typeof getLabels>
function getLabels(locale: string) {
  const zh = locale === 'zh-TW'
  return {
    translationHeading: zh ? '翻譯' : 'Translation',
    keyTranslationHeading: zh ? '重點翻譯' : 'Key translation',
    interpretHeading: zh ? '白話解讀' : 'Plain-language explanation',
    summaryLabel: zh ? '這份報告在檢查什麼' : 'What this report checks',
    findingsLabel: zh ? '主要發現' : 'Key findings',
    watchForLabel: zh ? '可以留意的地方' : 'Worth keeping an eye on',
    generating: zh
      ? 'AI 翻譯與解讀中，通常一分鐘內完成。'
      : 'Translating and explaining; this usually finishes within a minute.',
    generatingSlow: zh
      ? '處理時間比平常久；若超過 1 分 30 秒，系統會自動停止並讓你重試。'
      : 'This is taking longer than usual. The request will stop after 1 minute 30 seconds so you can retry.',
    elapsed: zh ? '已等待 {elapsed}' : 'Elapsed {elapsed}',
    loadingCached: zh ? '讀取既有 AI 解讀…' : 'Loading saved AI explanation…',
    trigger: zh ? 'AI 翻譯解讀' : 'AI translate & explain',
    regenerate: zh ? '重新產生' : 'Regenerate',
    copy: zh ? '複製' : 'Copy',
    copied: zh ? '已複製' : 'Copied',
    partial: zh
      ? '報告較長，僅翻譯與解讀了前半部內容。'
      : 'This report is long — only the first part was translated and explained.',
    longDocumentDigest: zh
      ? '文件較長，AI 已根據前後段內容整理重點；中間未送入的原文仍請直接查看原文件。'
      : 'This document is long, so AI summarized from the beginning and ending excerpts; please still check the omitted middle in the original document.',
    error: zh
      ? 'AI 產生失敗，請稍後再試一次。'
      : 'AI generation failed. Please try again in a moment.',
    errorNotRetryable: zh
      ? '這次不是暫時性問題，重新產生也不會成功。'
      : 'This is not a transient failure — regenerating will not help.',
    disclaimer: zh
      ? '本翻譯與解讀由 AI 產生，可能有誤，僅供幫助理解；報告的正確意義與後續處置，請以您的醫師解釋為準。'
      : 'This translation and explanation is AI-generated, may contain errors, and is only to aid understanding; for the correct meaning of the report and any next steps, defer to your doctor’s explanation.',
  }
}

// Quota and sign-in / API-key failures are the two causes a reader can act on
// (wait for tomorrow's reset, sign in, add a key) — and the two that never
// improve by pressing 重新產生. Everything else (network blip, timeout,
// unparseable reply) keeps the retry button. Matched against the ALREADY-MAPPED
// message the hook stores, which is what getUserErrorMessage produced.
const NON_RETRYABLE_ERROR_PATTERN =
  /訪客連線失敗|內建額度僅供登入|API Key 錯誤|配額或帳單問題|sign-?in required|invalid api key|billing/i

function describeInterpretationError(error: string, labels: Labels) {
  // 'PARSE_FAILED' is an internal sentinel, not something to show a patient.
  if (error === 'PARSE_FAILED') return { message: labels.error, retryable: true }
  const blocked = isQuotaExceededError(error) || NON_RETRYABLE_ERROR_PATTERN.test(error)
  return { message: error, retryable: !blocked }
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
  const { result, isGenerating, error, generationKey, isHydrated, generate, regenerate } =
    useReportInterpretation(hookArgs)
  const errorView = error ? describeInterpretationError(error, labels) : null
  const autoRequestedKeyRef = useRef<string | null>(null)

  // Auto-generate once for this exact input. The generate callback can change
  // identity when hook dependencies update; treating that as fresh intent made
  // a failed request immediately auto-start again, hiding its error and
  // resetting the elapsed timer in an endless loop. A real input change still
  // gets one fresh automatic attempt; later retries are always explicit.
  useEffect(() => {
    if (!autoGenerate) {
      autoRequestedKeyRef.current = null
      return
    }
    if (!isHydrated || !generationKey) return
    if (autoRequestedKeyRef.current === generationKey) return

    autoRequestedKeyRef.current = generationKey
    void generate()
  }, [autoGenerate, generate, generationKey, isHydrated])

  if (!isHydrated) {
    return (
      <div className={cn('my-2 flex items-center gap-2 py-2 text-xs text-muted-foreground', className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {labels.loadingCached}
      </div>
    )
  }

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
        'my-2 min-w-0 max-w-full overflow-hidden rounded-lg border border-primary/25 bg-primary/[0.03] px-3 py-2.5',
        className,
      )}
    >
      {isGenerating && !result && (
        <ReportInterpretationGeneratingState labels={labels} />
      )}

      {/* Show the CAUSE the hook already mapped (quota exhausted, sign-in
          required, key rejected…) instead of a blanket 請稍後再試 that sends the
          reader to retry something that cannot succeed. */}
      {errorView && !isGenerating && (
        <div className="flex items-start justify-between gap-2 py-1.5">
          <span className="flex min-w-0 items-start gap-1.5 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 break-words">
              {errorView.message}
              {!errorView.retryable && (
                <span className="mt-0.5 block text-muted-foreground">{labels.errorNotRetryable}</span>
              )}
            </span>
          </span>
          {errorView.retryable && (
            <button
              type="button"
              onClick={() => void regenerate()}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground hover:text-primary"
            >
              <RotateCw className="h-3 w-3" />
              {labels.regenerate}
            </button>
          )}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {result.truncated && (
            <div className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[0.6875rem] leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {result.coverage === 'long-document-digest'
                ? labels.longDocumentDigest
                : labels.partial}
            </div>
          )}

          {/* Region 1 — faithful translation for standard reports; key translation
              for long clinical documents. */}
          <section>
            <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-foreground/80">
              <Languages className="h-3.5 w-3.5 text-primary" />
              {result.mode === 'long-document'
                ? labels.keyTranslationHeading
                : labels.translationHeading}
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

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

export function ReportInterpretationGeneratingState({ labels }: { labels: Labels }) {
  const [startedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  const slowThresholdSeconds = Math.floor(
    Math.min(60_000, REPORT_INTERPRETATION_TOTAL_TIMEOUT_MS * 2 / 3) / 1000,
  )
  const message = elapsedSeconds >= slowThresholdSeconds
    ? labels.generatingSlow
    : labels.generating

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2 text-xs text-muted-foreground">
      <div className="flex min-w-0 flex-1 items-start gap-2" role="status" aria-live="polite">
        <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
        <span>{message}</span>
      </div>
      <span
        className="shrink-0 tabular-nums"
        role="timer"
        aria-live="off"
        data-testid="report-interpretation-elapsed"
      >
        {labels.elapsed.replace('{elapsed}', formatElapsed(elapsedSeconds))}
      </span>
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
  const { t } = useLanguage()
  // Shared clipboard helper — it owns the transient 「已複製」 state and reports
  // failure so a blocked clipboard doesn't look like a successful copy.
  const { copied, copy } = useCopyToClipboard(1500)
  const handleCopy = async () => {
    const parts = [
      `【${labels.translationHeading}】\n${result.translation}`,
      `【${labels.summaryLabel}】\n${result.summary}`,
      `【${labels.findingsLabel}】\n${result.findings}`,
      result.watchFor ? `【${labels.watchForLabel}】\n${result.watchFor}` : '',
    ].filter(Boolean)
    if (!await copy(parts.join('\n\n'))) toast.error(t.common.copyFailed)
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
