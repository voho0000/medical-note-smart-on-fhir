"use client"

// Live token meter for the 資料選擇 panel. Shows how much of the AI model's
// context window the current selection will occupy, plus the heaviest sections,
// so the user can SEE when a selection is too thin or (for an ICU/onco patient)
// about to overflow — the two failure modes that were previously invisible.
//
// Perf: formatting the full context can be expensive. We debounce it and lean
// on the per-document decode cache, so toggling stays responsive; the heavy
// string work runs ~400ms after the last change, off the interaction path.
import { useEffect, useMemo, useRef, useState } from "react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useClinicalContext } from "@/src/application/hooks/use-clinical-context.hook"
import { useClinicalAiInput } from "@/src/application/hooks/ai-generation/use-clinical-ai-input.hook"
import { estimateTokens } from "@/src/shared/utils/token-estimator"
import {
  DEFAULT_RESPONSE_RESERVE,
  evaluateContextBudget,
  formatApproxTokenCount,
  type ContextOverflowIssue,
  type ContextBudgetLevel,
} from "@/src/shared/utils/context-budget"
import { formatClinicalContextAdaptationNotice } from '@/src/core/utils/adaptive-clinical-context.utils'
import { useResolvedDataSelectionModel } from '../hooks/useResolvedDataSelectionModel'

const LEVEL_BAR: Record<ContextBudgetLevel, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  over: "bg-red-500",
}
const LEVEL_TEXT: Record<ContextBudgetLevel, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  over: "text-red-600 dark:text-red-400",
}

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`)

interface ContextTokenMeterProps {
  /** Raw model preference for the surface that opened this panel. */
  modelId?: string
  /** Free model used when the raw preference is currently key-gated. */
  fallbackModelId?: string
  overflowIssue?: ContextOverflowIssue | null
}

export function ContextTokenMeter({ modelId, fallbackModelId, overflowIssue }: ContextTokenMeterProps) {
  const { t, locale } = useLanguage()
  const ds = t.dataSelection as unknown as Record<string, string>
  // The main Data Selection drawer edits the summary/insights profile. Read
  // that exact consumer here too so a stale legacy chat profile cannot make
  // the meter disagree with the subsequent summary request.
  const { getClinicalContext, formatClinicalContext } = useClinicalContext('insights')
  const {
    modelId: effectiveModelId,
    contextLimit,
    modelLabel,
  } = useResolvedDataSelectionModel(
    modelId,
    fallbackModelId,
  )
  const fittedClinicalInput = useClinicalAiInput(contextLimit)

  // Debounced snapshot of the formatted context. We recompute sections on a
  // trailing timer rather than every render.
  const [sections, setSections] = useState<{ title: string; tokens: number }[]>([])
  const [total, setTotal] = useState(0)
  const rafRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // getClinicalContext identity changes whenever selection/filters change (its
  // deps), so it's a stable trigger for "recompute the meter".
  useEffect(() => {
    if (rafRef.current) clearTimeout(rafRef.current)
    rafRef.current = setTimeout(() => {
      const secs = getClinicalContext()
      const perSection = secs.map((s) => ({
        title: s.title,
        tokens: estimateTokens(formatClinicalContext([s])),
      }))
      setSections(perSection)
      // Estimate the same single formatted string used by summary generation;
      // summing separately formatted sections introduces small rounding and
      // empty-section discrepancies.
      setTotal(estimateTokens(formatClinicalContext(secs)))
    }, 400)
    return () => {
      if (rafRef.current) clearTimeout(rafRef.current)
    }
  }, [getClinicalContext, formatClinicalContext])

  const fittedTotal = useMemo(
    () => estimateTokens(fittedClinicalInput.clinicalContext),
    [fittedClinicalInput.clinicalContext],
  )
  const showsAdaptedScope = Boolean(
    fittedClinicalInput.dataReady &&
    fittedClinicalInput.contextAdaptation,
  )
  const displayedTotal = showsAdaptedScope ? fittedTotal : total
  const budget = evaluateContextBudget(
    displayedTotal,
    effectiveModelId,
    DEFAULT_RESPONSE_RESERVE,
    contextLimit,
  )
  const topSections = useMemo(
    () => [...sections].sort((a, b) => b.tokens - a.tokens).slice(0, 3).filter((s) => s.tokens > 0),
    [sections],
  )

  const pct = Math.round(budget.fraction * 100)

  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.6875rem] font-medium text-muted-foreground">
          {showsAdaptedScope
            ? locale === 'zh-TW' ? '本次實際送出內容' : 'Actual content for this run'
            : ds.tokenMeterLabel ?? "已選病歷內容"}
        </span>
        <span className={`text-[0.6875rem] tabular-nums ${LEVEL_TEXT[budget.level]}`}>
          ~{fmt(displayedTotal)} / {fmt(budget.usable)} tok · {pct}%
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-border/60">
        <div
          className={`h-full rounded-full transition-all ${LEVEL_BAR[budget.level]}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="truncate text-[0.625rem] text-muted-foreground">
          {(ds.tokenMeterModel ?? "模型") + ": " + modelLabel}
        </span>
        {topSections.length > 0 && !showsAdaptedScope && (
          <span className="truncate text-[0.625rem] text-muted-foreground" title={topSections.map((s) => `${s.title}: ${s.tokens}`).join("\n")}>
            {ds.tokenMeterTop ?? "最大宗"}: {topSections.map((s) => `${s.title} ${fmt(s.tokens)}`).join(" · ")}
          </span>
        )}
      </div>
      <p className="mt-1 text-[0.625rem] leading-snug text-muted-foreground">
        {ds.tokenMeterRequestHint ?? "產生摘要時還會加入 AI 指令、輸出格式與來源索引；送出前會顯示完整輸入量。"}
      </p>
      {showsAdaptedScope && fittedClinicalInput.contextAdaptation ? (
        <div
          role="note"
          data-testid="model-fitted-scope"
          className="mt-2 rounded-md border border-violet-300 bg-violet-50 px-2.5 py-2 text-[0.6875rem] leading-relaxed text-violet-950 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-100"
        >
          <p className="font-medium">
            {locale === 'zh-TW'
              ? `原始選擇約 ${formatApproxTokenCount(total)} tokens → 本次實際送出約 ${formatApproxTokenCount(fittedTotal)} tokens`
              : `Saved selection: about ${formatApproxTokenCount(total)} tokens → actual content for this run: about ${formatApproxTokenCount(fittedTotal)} tokens`}
          </p>
          <p>
            {formatClinicalContextAdaptationNotice(
              fittedClinicalInput.contextAdaptation,
              locale,
            )}
          </p>
          <p className="mt-0.5 opacity-80">
            {locale === 'zh-TW'
              ? '下方控制項與「預覽」已同步顯示本次實際範圍；切回較大模型會自動恢復原本儲存的設定。'
              : 'The controls and Preview now show the effective scope for this run; switching back to a larger model restores your saved settings.'}
          </p>
        </div>
      ) : null}
      {overflowIssue ? (
        <div
          role="status"
          className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[0.6875rem] leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
        >
          <p className="font-medium">
            {(ds.tokenMeterOverflowGuidance ?? "上次完整摘要輸入約 {request} tokens，超過可用的 {usable} tokens。")
              .replace("{request}", formatApproxTokenCount(overflowIssue.requestTokens))
              .replace("{usable}", formatApproxTokenCount(overflowIssue.usable))}
          </p>
          {overflowIssue.selectedTokens !== null && overflowIssue.suggestedSelectedMax !== null ? (
            <p>
              {(ds.tokenMeterReductionTarget ?? "至少需減少約 {reduction} tokens；建議將已選病歷降至 {target} tokens 以下。")
                .replace("{reduction}", formatApproxTokenCount(overflowIssue.overBy))
                .replace("{target}", formatApproxTokenCount(overflowIssue.suggestedSelectedMax))}
            </p>
          ) : null}
          {overflowIssue.suggestedSelectedMax !== null && displayedTotal <= overflowIssue.suggestedSelectedMax ? (
            <p className="mt-0.5 font-medium text-emerald-700 dark:text-emerald-300">
              {ds.tokenMeterTargetReached ?? "目前已低於建議值；關閉後可重新產生，系統會再次檢查完整輸入。"}
            </p>
          ) : null}
        </div>
      ) : null}
      {budget.level === "over" && (
        <p className="mt-1 text-[0.625rem] text-red-600 dark:text-red-400">
          {ds.tokenMeterOver ?? "已選病歷本身已超過此模型的可用輸入空間；建議縮小文件或檢驗範圍，或改用內容視窗更大的模型。"}
        </p>
      )}
    </div>
  )
}
