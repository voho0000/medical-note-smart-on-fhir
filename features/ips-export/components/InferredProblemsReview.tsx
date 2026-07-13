"use client"

// IPS Phase 2.2b — review panel for LLM-inferred problem suggestions.
//
// Suggestions are NEVER auto-included: each row carries a checkbox, an
// inference-confidence badge, and a collapsible evidence trail so a clinician
// can verify before confirming. The problem list is text-only — the app
// generates no diagnosis codes, so there is no coding badge. Only checked rows
// are surfaced (via the hook's `confirmed`) for the bundle merge.

import { useEffect, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useLanguage } from '@/src/application/providers/language.provider'
import type { InferredProblem, ProblemEvidence } from '../utils/inferred-problems-types'
import type { InferenceStatus } from '../hooks/useInferredProblems'

/**
 * Seconds elapsed while `active` is true; resets to 0 each time it flips on.
 * Drives the inline timer next to the loading message so the user can see how
 * long an inference run has been going (typically 20–60s).
 */
function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!active) return
    setSeconds(0)
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [active])
  return seconds
}

interface InferredProblemsReviewProps {
  status: InferenceStatus
  problems: InferredProblem[]
  confirmedIds: ReadonlySet<string>
  confirmedCount: number
  available: boolean
  error: string | null
  onRun: () => void
  onToggle: (id: string) => void
  /** Bulk check/uncheck every current suggestion (全選 / 取消全選). */
  onSetAll?: (checked: boolean) => void
  /** >0 when a medical-audience summary exists: the trigger becomes
   *  「帶入醫療摘要的問題清單（N 項）」 and onRun imports it (Path A). */
  summaryCount?: number
  /** Deterministic (no-AI) import of recent visit ICD-10 codes. */
  onImportEncounterIcds?: () => void
  /** Withdraw the imported visit-ICD rows (import button's toggle state). */
  onRemoveEncounterIcds?: () => void
  /** Withdraw the AI/summary rows (companion to 重新產生). */
  onRemoveAiProblems?: () => void
  /** Count of importable recent visit ICD codes — 0 hides the ICD button. */
  encounterIcdCount?: number
}

export function InferredProblemsReview({
  status,
  problems,
  confirmedIds,
  confirmedCount,
  available,
  error,
  onRun,
  onToggle,
  onSetAll,
  summaryCount = 0,
  onImportEncounterIcds,
  onRemoveEncounterIcds,
  onRemoveAiProblems,
  encounterIcdCount = 0,
}: InferredProblemsReviewProps) {
  const { t } = useLanguage()
  const x = t.ipsExport
  const p = x.inferredProblems
  const elapsedSeconds = useElapsedSeconds(status === 'loading')
  // Whole-panel collapse (title row is the toggle); default open.
  const [panelOpen, setPanelOpen] = useState(true)

  const runLabel =
    summaryCount > 0 ? p.runFromSummary.replace('{count}', String(summaryCount)) : p.run
  // The AI button toggles import ↔ withdraw, exactly like the ICD button (no
  // 重新產生 — it misread as "run a fresh AI inference" when a summary exists;
  // to refresh, the user withdraws and imports again).
  const hasAiRows = problems.some((problem) => problem.origin !== 'encounter-icd')
  // The ICD button toggles: import ↔ withdraw, keyed on whether ICD rows are
  // currently in the list (label count = the rows it would remove).
  const icdRowCount = problems.filter((problem) => problem.origin === 'encounter-icd').length
  const hasIcdRows = icdRowCount > 0

  return (
    <div className="space-y-3 rounded-md border border-violet-200 bg-violet-50/40 p-3 dark:border-violet-900 dark:bg-violet-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Title doubles as the panel's collapse toggle; the confirmed count
            stays visible while collapsed so hidden state isn't lost. */}
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium"
          aria-expanded={panelOpen}
        >
          {panelOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <Sparkles className="h-4 w-4 text-violet-500" />
          {p.title}
          {!panelOpen && confirmedCount > 0 && (
            <span className="ml-1 text-xs font-normal text-violet-700 dark:text-violet-300">
              {p.confirmedCount.replace('{count}', String(confirmedCount))}
            </span>
          )}
        </button>
        {panelOpen && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Deterministic ICD import — NOT gated by the AI toggle or an API key. */}
          {encounterIcdCount > 0 && onImportEncounterIcds && (
            <Button
              onClick={hasIcdRows ? onRemoveEncounterIcds : onImportEncounterIcds}
              disabled={status === 'loading'}
              size="sm"
              variant="outline"
              className="h-7 text-xs"
            >
              <ClipboardList className="mr-1 h-3.5 w-3.5" />
              {hasIcdRows
                ? p.removeEncounterIcds.replace('{count}', String(icdRowCount))
                : p.importEncounterIcds.replace('{count}', String(encounterIcdCount))}
            </Button>
          )}
          {/* AI trigger — always visible; a run only ever starts from this
              explicit press (the press IS the consent, no enable-switch).
              Disabled (with hint below) when no LLM provider is usable. */}
          <Button
            onClick={hasAiRows ? onRemoveAiProblems : onRun}
            disabled={(!available && !hasAiRows) || status === 'loading'}
            size="sm"
            variant="outline"
            className="h-7 text-xs"
          >
            {status === 'loading' ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-3.5 w-3.5" />
            )}
            {hasAiRows ? p.removeAiProblems : runLabel}
          </Button>
        </div>
        )}
      </div>

      {panelOpen && (<>
      <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">{p.disclaimer}</p>

      {!available && (
        <p className="text-xs text-amber-700 dark:text-amber-400">{p.noKeyHint}</p>
      )}

      {status === 'loading' && (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {p.loading}
          <span className="tabular-nums text-muted-foreground/70">
            {p.loadingSeconds.replace('{seconds}', String(elapsedSeconds))}
          </span>
        </div>
      )}

      {status === 'error' &&
        (error === 'no-key' ? (
          <p className="text-xs text-destructive">{p.noKeyHint}</p>
        ) : (
          <div className="space-y-0.5">
            <p className="text-xs text-destructive">{p.error}</p>
            {error && <p className="break-words text-[0.6875rem] text-destructive/80">{error}</p>}
          </div>
        ))}

      {status === 'ready' && problems.length === 0 && (
        <p className="py-2 text-xs text-muted-foreground">{p.empty}</p>
      )}

      {/* The list renders whenever candidates exist — an AI run in progress (or
          an AI error) must not hide already-imported visit-ICD rows. */}
      {problems.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-[0.6875rem] text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">{p.confirmHint}</span>
            <div className="flex shrink-0 items-center gap-2">
              {onSetAll && (
                <button
                  type="button"
                  onClick={() => onSetAll(confirmedCount < problems.length)}
                  className="rounded border border-border/70 px-1.5 py-0.5 font-medium text-foreground hover:bg-muted"
                >
                  {confirmedCount < problems.length ? p.selectAll : p.deselectAll}
                </button>
              )}
              <span className="font-medium text-violet-700 dark:text-violet-300">
                {p.confirmedCount.replace('{count}', String(confirmedCount))}
              </span>
            </div>
          </div>
          {problems.map((problem) => (
            <InferredProblemRow
              key={problem.id}
              problem={problem}
              checked={confirmedIds.has(problem.id)}
              onToggle={() => onToggle(problem.id)}
            />
          ))}
        </div>
      )}
      </>)}
    </div>
  )
}

function InferredProblemRow({
  problem,
  checked,
  onToggle,
}: {
  problem: InferredProblem
  checked: boolean
  onToggle: () => void
}) {
  const { t } = useLanguage()
  const p = t.ipsExport.inferredProblems
  const [open, setOpen] = useState(false)

  const main = problem.labelZh || problem.labelEn
  const sub = problem.labelEn && problem.labelEn !== main ? problem.labelEn : undefined
  const hasEvidence = problem.evidence.length > 0 || problem.rationale
  const isEncounterIcd = problem.origin === 'encounter-icd'
  // Visit-ICD candidates carry their real ICD code + visit count on the row.
  const icdCode = isEncounterIcd ? problem.sourceCoding?.code : undefined
  const visitCount = isEncounterIcd
    ? problem.evidence.find((e) => e.kind === 'encounter-icd')?.count
    : undefined

  return (
    <div className="rounded-md border bg-background px-2 py-1">
      {/* Single-line header: checkbox · name · badges · evidence toggle. Text-only
          (AI/summary) rows show no coding badge. Visit-ICD rows show their origin,
          a 「非確診」 flag, the ICD code + visit count, and NO confidence badge. */}
      <div className="flex items-center gap-2">
        <Checkbox checked={checked} onCheckedChange={onToggle} className="shrink-0" aria-label={main} />
        <span className="truncate text-sm font-medium">{main}</span>
        {icdCode && (
          <span className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[0.625rem] text-muted-foreground">
            {icdCode}
          </span>
        )}
        {sub && <span className="hidden truncate text-xs text-muted-foreground sm:inline">{sub}</span>}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {problem.origin === 'summary' && (
            <span className="rounded border border-sky-200 bg-sky-100 px-1 py-0.5 text-[0.625rem] font-medium text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300">
              {p.fromSummary}
            </span>
          )}
          {isEncounterIcd && (
            <>
              {visitCount ? (
                <span className="hidden shrink-0 text-[0.625rem] text-muted-foreground sm:inline">
                  {p.visits.replace('{count}', String(visitCount))}
                </span>
              ) : null}
              <span className="rounded border border-slate-200 bg-slate-100 px-1 py-0.5 text-[0.625rem] font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
                {p.visitIcd}
              </span>
              <span
                className="rounded border border-amber-300 bg-amber-100 px-1 py-0.5 text-[0.625rem] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                title={p.unconfirmed}
              >
                {p.unconfirmed}
              </span>
            </>
          )}
          {/* Confidence is meaningless for a raw source code — omit for visit ICDs. */}
          {!isEncounterIcd && <ConfidenceBadge confidence={problem.inferenceConfidence} />}
          {hasEvidence && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? p.hideEvidence : p.showEvidence}
              className="ml-0.5 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      {hasEvidence && open && (
        <div className="mt-1.5 pl-6">
          <div className="space-y-1.5 border-l-2 border-muted pl-2 text-[0.6875rem]">
              {problem.evidence.length > 0 && (
                <ul className="space-y-0.5">
                  {problem.evidence.map((e, i) => (
                    <li key={i} className="text-muted-foreground">
                      <span className="font-medium text-foreground">{evidenceKindLabel(e, p)}: </span>
                      {e.label}
                      {e.kind === 'encounter-icd' && e.count
                        ? ` · ${p.visits.replace('{count}', String(e.count))}`
                        : ''}
                      {e.date ? ` · ${e.date.slice(0, 10)}` : ''}
                    </li>
                  ))}
                </ul>
              )}
              {problem.rationale && (
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">{p.rationaleTitle}: </span>
                  {problem.rationale}
                </p>
              )}
          </div>
        </div>
      )}
    </div>
  )
}

function evidenceKindLabel(
  e: ProblemEvidence,
  p: { evidenceKind: Record<string, string> },
): string {
  const map: Record<string, string> = {
    'encounter-icd': p.evidenceKind.encounterIcd,
    medication: p.evidenceKind.medication,
    'discharge-excerpt': p.evidenceKind.dischargeExcerpt,
    lab: p.evidenceKind.lab,
    composition: p.evidenceKind.composition,
  }
  return map[e.kind] ?? e.kind
}

function ConfidenceBadge({ confidence }: { confidence: 'high' | 'medium' | 'low' }) {
  const { t } = useLanguage()
  const labels = t.ipsExport.inferredProblems.confidence
  const styles: Record<typeof confidence, string> = {
    high: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
    medium: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900',
    low: 'bg-muted text-muted-foreground border-border',
  }
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[0.625rem] font-medium ${styles[confidence]}`}>
      {labels[confidence]}
    </span>
  )
}
