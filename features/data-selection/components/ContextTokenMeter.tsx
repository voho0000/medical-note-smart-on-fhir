"use client"

// Live token meter for the 資料選擇 panel. Shows how much of the chat model's
// context window the current selection will occupy, plus the heaviest sections,
// so the user can SEE when a selection is too thin or (for an ICU/onco patient)
// about to overflow — the two failure modes that were previously invisible.
//
// Perf: formatting the full context is the same expensive call the preview tab
// gates. We debounce it and lean on the per-document decode cache, so retyping /
// toggling stays responsive; the heavy string work runs ~400ms after the last
// change, off the interaction path.
import { useEffect, useMemo, useRef, useState } from "react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useClinicalContext } from "@/src/application/hooks/use-clinical-context.hook"
import { useEffectiveModel } from "@/src/application/stores/model-prefs.store"
import { getModelDefinition } from "@/src/shared/constants/ai-models.constants"
import { estimateTokens } from "@/src/shared/utils/token-estimator"
import { evaluateContextBudget, type ContextBudgetLevel } from "@/src/shared/utils/context-budget"

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

export function ContextTokenMeter() {
  const { t } = useLanguage()
  const ds = t.dataSelection as unknown as Record<string, string>
  const { getClinicalContext, formatClinicalContext } = useClinicalContext()
  const modelId = useEffectiveModel("chat")

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
      setTotal(perSection.reduce((sum, s) => sum + s.tokens, 0))
    }, 400)
    return () => {
      if (rafRef.current) clearTimeout(rafRef.current)
    }
  }, [getClinicalContext, formatClinicalContext])

  const budget = useMemo(() => evaluateContextBudget(total, modelId), [total, modelId])
  const topSections = useMemo(
    () => [...sections].sort((a, b) => b.tokens - a.tokens).slice(0, 3).filter((s) => s.tokens > 0),
    [sections],
  )

  const modelLabel = getModelDefinition(modelId)?.label ?? modelId
  const pct = Math.round(budget.fraction * 100)

  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.6875rem] font-medium text-muted-foreground">
          {ds.tokenMeterLabel ?? "內容量"}
        </span>
        <span className={`text-[0.6875rem] tabular-nums ${LEVEL_TEXT[budget.level]}`}>
          ~{fmt(total)} / {fmt(budget.usable)} tok · {pct}%
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
        {topSections.length > 0 && (
          <span className="truncate text-[0.625rem] text-muted-foreground" title={topSections.map((s) => `${s.title}: ${s.tokens}`).join("\n")}>
            {ds.tokenMeterTop ?? "最大宗"}: {topSections.map((s) => `${s.title} ${fmt(s.tokens)}`).join(" · ")}
          </span>
        )}
      </div>
      {budget.level === "over" && (
        <p className="mt-1 text-[0.625rem] text-red-600 dark:text-red-400">
          {ds.tokenMeterOver ?? "已超過此模型的內容上限,送出前部分較舊對話會被截斷;建議縮小文件/檢驗範圍,或改用更大內容視窗的模型。"}
        </p>
      )}
    </div>
  )
}
