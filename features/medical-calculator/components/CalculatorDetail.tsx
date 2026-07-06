"use client"

import { useMemo, useState, useCallback } from "react"
import { ArrowLeft, RotateCw, Sparkles, AlertTriangle, Star, Users, Lightbulb, Copy, Check, ChevronDown, Table2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLanguage } from "@/src/application/providers/language.provider"
import type { CalculatorDef, CalcValues, Severity } from "../types"
import { tr, trAlt } from "../types"
import { useLabAutofill, type Autofill } from "../hooks/use-lab-autofill.hook"
import { getCalcInfo, getCalcScoring } from "../calculators"
import type { CalcScoring, ScoringGrid, GridColor } from "../calculators"
import { formatNum, resolveInput } from "../autofill-compute"
import { resultToClipboardText, isImplausible, coherenceSpan } from "../format"
import { useCopyToClipboard } from "@/src/shared/hooks/use-copy-to-clipboard"

const SEVERITY_STYLES: Record<Severity, string> = {
  normal: "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300",
  low: "border-sky-500 bg-sky-50 text-sky-800 dark:bg-sky-500/10 dark:text-sky-300",
  moderate: "border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300",
  high: "border-red-500 bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-300",
}

/** Defensive guard around a calculator's `compute()` — a single formula bug
 *  (a hand-authored edge case someone missed) must degrade to "can't compute"
 *  for that one calculator, not crash the whole detail view / right panel. */
function safeCompute(calc: CalculatorDef, values: CalcValues): ReturnType<CalculatorDef['compute']> {
  try {
    return calc.compute(values)
  } catch (err) {
    console.error(`[medical-calculator] compute() threw for "${calc.id}":`, err)
    return null
  }
}

interface FilledInfo {
  date: string
  /** Unit the source observation reported the value in. */
  sourceUnit: string
  /** True when the value was numerically converted into the expected unit. */
  changed: boolean
  /** The original (pre-conversion) source value, for the "from X" hint. */
  origValue: number
  /** True when the source unit differs and could NOT be converted → real ⚠. */
  unconvertible: boolean
}

/** Seed a calculator's inputs from patient data. Delegates the per-input
 *  resolution + unit conversion to the shared `resolveInput` (autofill-compute)
 *  — the SAME function the list uses — then unpacks it into the three maps this
 *  view renders: `values` (field contents), `filled` (auto-fill badge info),
 *  and `units` (the unit label to show, which reflects the real source unit for
 *  equivalent-unit fills). */
function seed(calc: CalculatorDef, autofill: Autofill): {
  values: CalcValues
  filled: Record<string, FilledInfo>
  units: Record<string, string>
} {
  const values: CalcValues = {}
  const filled: Record<string, FilledInfo> = {}
  const units: Record<string, string> = {}
  for (const input of calc.inputs) {
    const r = resolveInput(input, autofill)
    values[input.key] = r.value
    if (input.type === "number") units[input.key] = r.displayUnit
    if (r.filled) {
      filled[input.key] = {
        date: r.date, sourceUnit: r.sourceUnit, changed: r.changed, origValue: r.origValue, unconvertible: r.unconvertible,
      }
    }
  }
  return { values, filled, units }
}

export function CalculatorDetail({
  calc,
  onBack,
  isFavorite,
  onToggleFavorite,
}: {
  calc: CalculatorDef
  onBack: () => void
  /** Lifted to the parent (single `useCalcFavorites()` instance) so toggling
   *  here and the list's ⭐ stay in sync — two independent hook instances
   *  each backed by their own localStorage-hook state would not notify each
   *  other on change. */
  isFavorite: boolean
  onToggleFavorite: () => void
}) {
  const { locale } = useLanguage()
  const autofill = useLabAutofill()

  const initial = useMemo(() => seed(calc, autofill), [calc, autofill])
  const [values, setValues] = useState<CalcValues>(initial.values)
  // Which keys currently hold an auto-filled value (cleared on manual edit).
  const [filled, setFilled] = useState<Record<string, FilledInfo>>(initial.filled)
  // Unit each field is shown in — reflects the actual FHIR source unit for
  // equivalent-unit fills. Persists across manual edits (same scale).
  const [displayUnits, setDisplayUnits] = useState<Record<string, string>>(initial.units)

  const setValue = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setFilled((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  const refill = useCallback(() => {
    const s = seed(calc, autofill)
    setValues(s.values)
    setFilled(s.filled)
    setDisplayUnits(s.units)
  }, [calc, autofill])

  const result = useMemo(() => safeCompute(calc, values), [calc, values])
  const hasAnyAutofill = Object.keys(filled).length > 0
  const info = getCalcInfo(calc.id)
  const scoring = getCalcScoring(calc.id)
  // Warn when the auto-filled values that should share one draw/day actually
  // span more than the calculator's coherence window (e.g. FENa mixing today's
  // urine with an old serum). Only auto-filled fields carry a date.
  const coherence = useMemo(
    () => (calc.coherence ? coherenceSpan(calc.coherence.keys.map((k) => filled[k]?.date), calc.coherence.windowDays) : null),
    [calc, filled],
  )
  const { copied, copy } = useCopyToClipboard()

  const zh = locale === "zh-TW"

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-8 gap-1 px-2">
          <ArrowLeft className="h-4 w-4" />
          {zh ? "返回" : "Back"}
        </Button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{tr(locale, calc.name)}</div>
          {trAlt(locale, calc.name) && (
            <div className="truncate text-xs font-normal text-muted-foreground">{trAlt(locale, calc.name)}</div>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleFavorite}
          className="h-8 w-8 shrink-0 p-0"
          title={zh ? (isFavorite ? "移除常用" : "加入常用") : (isFavorite ? "Remove from favorites" : "Add to favorites")}
          aria-label={zh ? "加入常用" : "Add to favorites"}
        >
          <Star className={`h-4 w-4 ${isFavorite ? "fill-amber-400 text-amber-500" : ""}`} />
        </Button>
        {hasAnyAutofill && (
          <Button variant="outline" size="sm" onClick={refill} className="h-8 gap-1 px-2" title={zh ? "重新帶入病人資料" : "Refill from patient"}>
            <RotateCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{zh ? "重新帶入" : "Refill"}</span>
          </Button>
        )}
      </div>

      {/* Blurb is only shown when there's no "When to use" — otherwise the two
          restate the same one-liner (the useWhen box is the richer version). */}
      {calc.blurb && !info.useWhen && (
        <p className="text-xs text-muted-foreground">{tr(locale, calc.blurb)}</p>
      )}

      {/* When to use — patient population / indication (MDCalc "When to Use"). */}
      {info.useWhen && (
        <div className="flex gap-2 rounded-md border border-sky-200 bg-sky-50/60 px-3 py-2 dark:border-sky-500/25 dark:bg-sky-500/10">
          <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
          <div className="min-w-0 text-xs leading-relaxed text-sky-900 dark:text-sky-200">
            <span className="font-semibold">{zh ? "適用時機　" : "When to use　"}</span>
            {tr(locale, info.useWhen)}
          </div>
        </div>
      )}

      {/* Temporal-coherence warning: auto-filled values span different reports. */}
      {coherence && (
        <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50/70 px-3 py-2 dark:border-amber-500/30 dark:bg-amber-500/10">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
            {zh
              ? `注意：自動帶入的數值來自相差 ${coherence.spanDays} 天的不同報告（${coherence.earliest} ～ ${coherence.latest}）。此公式應使用同一次／同日的檢驗，請確認一致性。`
              : `Heads-up: the auto-filled values are from reports ${coherence.spanDays} days apart (${coherence.earliest} – ${coherence.latest}). This formula expects one same-day draw — verify they belong together.`}
          </div>
        </div>
      )}

      {/* Result — compact so it doesn't dominate the panel. */}
      <div className={`relative rounded-lg border border-l-4 px-3 py-2.5 ${result?.severity ? SEVERITY_STYLES[result.severity] : "border-l-muted"}`}>
        {result && (
          <button
            type="button"
            onClick={() => copy(resultToClipboardText(calc, result, locale))}
            title={zh ? "複製結果（可貼入病歷）" : "Copy result (paste into note)"}
            aria-label={zh ? "複製結果" : "Copy result"}
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium opacity-70 transition-colors hover:bg-current/10 hover:opacity-100"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? (zh ? "已複製" : "Copied") : (zh ? "複製" : "Copy")}</span>
          </button>
        )}
        {result ? (
          <div className="space-y-0.5">
            <div className="flex items-baseline gap-1.5 pr-16">
              <span className="text-2xl font-bold leading-none tabular-nums">{result.value}</span>
              {result.unit && <span className="text-xs font-medium opacity-80">{result.unit}</span>}
            </div>
            {result.interpretation && (
              <div className="text-sm font-medium leading-snug">{tr(locale, result.interpretation)}</div>
            )}
            {result.extra && result.extra.length > 0 && (
              <div className="space-y-0.5 pt-1">
                {result.extra.map((row, i) => (
                  <div key={i} className="flex justify-between gap-3 text-xs opacity-90">
                    <span>{tr(locale, row.label)}</span>
                    <span className="font-medium tabular-nums">{row.value}</span>
                  </div>
                ))}
              </div>
            )}
            {result.notes && (
              <div className="pt-1 text-xs leading-relaxed opacity-90">
                {tr(locale, result.notes)}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            {zh ? "請填入所有必要欄位以計算。" : "Enter the required inputs to calculate."}
          </div>
        )}
      </div>

      {/* Inputs */}
      <div className="space-y-3">
        {calc.inputs.map((input) => {
          const fill = filled[input.key]
          const expectedUnit = input.type === "number" ? input.unit : undefined
          const unit = input.type === "number" ? (displayUnits[input.key] || input.unit) : undefined
          const range = input.type === "number" ? input.normalRange : undefined
          const placeholder = range
            ? (zh ? `正常 ${range.low}–${range.high}` : `Normal ${range.low}–${range.high}`)
            : undefined
          const implausible = input.type === "number" && isImplausible(input, values[input.key] ?? "")
          return (
            <div key={input.key} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={`calc-${input.key}`} className="text-xs font-medium">
                  {tr(locale, input.label)}
                  {unit ? <span className="ml-1 text-muted-foreground">({unit})</span> : null}
                </Label>
                {fill && (
                  fill.unconvertible ? (
                    <span
                      className="flex shrink-0 items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400"
                      title={zh ? `來源單位 ${fill.sourceUnit} 無法自動換算為 ${expectedUnit}，請確認數值` : `Source unit ${fill.sourceUnit} can't be auto-converted to ${expectedUnit} — verify`}
                    >
                      <AlertTriangle className="h-3 w-3" />
                      {fill.date ? fill.date.slice(0, 10) : ""} · {fill.sourceUnit}
                    </span>
                  ) : (
                    <span
                      className="flex shrink-0 items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400"
                      title={zh ? "自病人資料自動帶入" : "Auto-filled from patient data"}
                    >
                      <Sparkles className="h-3 w-3" />
                      {fill.date ? fill.date.slice(0, 10) : (zh ? "自動" : "auto")}
                      {fill.changed && (
                        <span className="text-muted-foreground" title={zh ? "已自來源單位換算" : "converted from source unit"}>
                          ({formatNum(fill.origValue)} {fill.sourceUnit})
                        </span>
                      )}
                    </span>
                  )
                )}
              </div>
              {input.type === "select" ? (
                <Select value={values[input.key] ?? ""} onValueChange={(v) => setValue(input.key, v)}>
                  <SelectTrigger id={`calc-${input.key}`} className="h-9">
                    <SelectValue placeholder={zh ? "請選擇…" : "Select…"} />
                  </SelectTrigger>
                  <SelectContent>
                    {input.options.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {tr(locale, opt.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <>
                  <Input
                    id={`calc-${input.key}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={values[input.key] ?? ""}
                    onChange={(e) => setValue(input.key, e.target.value)}
                    placeholder={placeholder}
                    className={`h-9 ${implausible ? "border-amber-500 focus-visible:ring-amber-500/50" : ""}`}
                    aria-invalid={implausible || undefined}
                  />
                  {implausible && (
                    <p className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      {zh ? "數值遠超出正常範圍，請確認是否輸入有誤。" : "Value is far outside the normal range — double-check for a typo."}
                    </p>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Pearls / pitfalls — caveats & when NOT to rely on this (MDCalc-style). */}
      {info.caveats && (
        <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 dark:border-amber-500/25 dark:bg-amber-500/10">
          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
            <span className="font-semibold">{zh ? "注意事項　" : "Pearls / pitfalls　"}</span>
            {tr(locale, info.caveats)}
          </div>
        </div>
      )}

      {/* 計算說明 / Scoring — collapsible per-factor points table (only when
          authored; default collapsed so it doesn't dominate the panel). */}
      {scoring && <ScoringDetails scoring={scoring} locale={locale} />}

      {calc.reference && (
        <p className="border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">
          {calc.reference}
        </p>
      )}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {zh
          ? "⚠ 計算結果僅供臨床參考，數值以病人最近一次檢驗自動帶入，請務必核對單位與臨床情境後判斷。"
          : "⚠ For clinical reference only. Values are auto-filled from the most recent result — verify units and context before acting."}
      </p>
    </div>
  )
}

/** Collapsible "計算說明 / Scoring" — the per-factor points table plus the
 *  score→outcome mapping, for calculators whose points are hidden behind banded
 *  numeric inputs (e.g. the HCC risk score). Native <details> = no extra state. */
function ScoringDetails({ scoring, locale }: { scoring: CalcScoring; locale: string }) {
  const zh = locale === "zh-TW"
  return (
    <details className="group rounded-md border">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-foreground/80 [&::-webkit-details-marker]:hidden">
        <Table2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {zh ? "計算說明" : "Scoring"}
        <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t px-3 py-2.5">
        {scoring.formula && (
          <div className="rounded border bg-muted/40 px-2 py-1.5 text-xs leading-relaxed">
            <div className="mb-0.5 text-[11px] font-semibold text-muted-foreground">{zh ? "公式" : "Formula"}</div>
            <div className="whitespace-pre-wrap font-mono text-[11px]">{tr(locale, scoring.formula)}</div>
          </div>
        )}
        {scoring.grid && <ScoringGridView grid={scoring.grid} locale={locale} />}
        {(scoring.factors ?? []).map((f, i) => (
          <div key={i}>
            <div className="mb-1 text-[11px] font-semibold text-muted-foreground">{tr(locale, f.label)}</div>
            <div className="overflow-hidden rounded border">
              {f.options.map((o, j) => (
                <div
                  key={j}
                  className={`flex items-center justify-between gap-3 px-2 py-1 text-xs ${j % 2 ? "bg-muted/40" : ""}`}
                >
                  <span className="min-w-0 truncate">{tr(locale, o.label)}</span>
                  <span className="shrink-0 font-medium tabular-nums">{o.points}{zh ? " 分" : " pt"}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {scoring.outcome && (
          <div>
            <div className="overflow-hidden rounded border">
              <div className="flex items-center justify-between gap-3 bg-muted/60 px-2 py-1 text-[11px] font-semibold">
                <span>{tr(locale, scoring.outcome.scoreHeader)}</span>
                <span>{tr(locale, scoring.outcome.outcomeHeader)}</span>
              </div>
              {scoring.outcome.rows.map((r, i) => (
                <div key={i} className={`flex items-center justify-between gap-3 px-2 py-1 text-xs ${i % 2 ? "bg-muted/40" : ""}`}>
                  <span className="shrink-0 tabular-nums">{r.score}</span>
                  <span className="text-right font-medium">{tr(locale, r.outcome)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {scoring.note && (
          <p className="text-[10px] leading-relaxed text-muted-foreground">{tr(locale, scoring.note)}</p>
        )}
      </div>
    </details>
  )
}

// KDIGO-style heat-map colours. Fixed (standard clinical colour code), so they
// read the same in light and dark mode.
const GRID_CELL_COLOR: Record<GridColor, string> = {
  green: "bg-green-500 text-white",
  yellow: "bg-yellow-300 text-black",
  orange: "bg-orange-400 text-black",
  red: "bg-red-500 text-white",
  deepred: "bg-red-800 text-white",
}

/** Renders a colour-coded matrix (e.g. the KDIGO GFR × albuminuria heat map).
 *  Scrolls horizontally on narrow panels rather than overflowing. */
function ScoringGridView({ grid, locale }: { grid: ScoringGrid; locale: string }) {
  const nCols = grid.cols.length
  return (
    <div>
      {grid.caption && (
        <div className="mb-1 text-[11px] font-semibold text-muted-foreground">{tr(locale, grid.caption)}</div>
      )}
      {grid.colAxis && (
        <div className="mb-0.5 text-center text-[10px] font-medium text-muted-foreground">{tr(locale, grid.colAxis)}</div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-center text-[11px]">
          <thead>
            <tr>
              <th className="border bg-muted/60 px-1.5 py-1 text-left align-bottom text-[9px] font-medium leading-tight text-muted-foreground">
                {grid.rowAxis ? tr(locale, grid.rowAxis) : ""}
              </th>
              {grid.cols.map((c, i) => (
                <th key={i} className="border bg-muted/60 px-1.5 py-1 font-semibold">
                  <div>{tr(locale, c.label)}</div>
                  {c.sub && <div className="text-[9px] font-normal text-muted-foreground">{tr(locale, c.sub)}</div>}
                </th>
              ))}
            </tr>
            {(grid.colSubRows ?? []).map((sr, i) => (
              <tr key={`sr-${i}`}>
                <th className="border bg-muted/30 px-1.5 py-0.5 text-left text-[9px] font-medium text-muted-foreground">{tr(locale, sr.label)}</th>
                {sr.cells.map((cell, j) => (
                  <td key={j} className="border bg-muted/20 px-1.5 py-0.5 text-[9px] text-muted-foreground">{cell}</td>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {grid.rows.map((r, ri) => (
              <tr key={ri}>
                <th className="border bg-muted/40 px-1.5 py-1 text-left text-[10px] font-medium leading-tight">
                  <div>{tr(locale, r.label)}</div>
                  {r.sub && <div className="text-[9px] font-normal text-muted-foreground">{tr(locale, r.sub)}</div>}
                </th>
                {(grid.cells[ri] ?? []).slice(0, nCols).map((cell, ci) => (
                  <td key={ci} className={`border px-1.5 py-1.5 font-bold ${GRID_CELL_COLOR[cell.color]}`}>
                    {tr(locale, cell.text)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {grid.legend && (
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{tr(locale, grid.legend)}</p>
      )}
    </div>
  )
}
