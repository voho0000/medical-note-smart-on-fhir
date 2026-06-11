"use client"

// IPS Phase 2.2b — review panel for LLM-inferred problem suggestions.
//
// Suggestions are NEVER auto-included: each row carries a checkbox, an
// inference-confidence badge, a SNOMED-coding badge (green = verified B/C, amber
// = needs manual coding for Strategy A, grey = ICD/text-only), and a collapsible
// evidence trail so a clinician can verify before confirming. Only checked rows
// are surfaced (via the hook's `confirmed`) for the bundle merge.

import { useState } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useLanguage } from '@/src/application/providers/language.provider'
import type { InferredProblem, ProblemEvidence } from '../utils/inferred-problems-types'
import type { InferenceStatus } from '../hooks/useInferredProblems'

interface InferredProblemsReviewProps {
  status: InferenceStatus
  problems: InferredProblem[]
  confirmedIds: ReadonlySet<string>
  confirmedCount: number
  available: boolean
  error: string | null
  onRun: () => void
  onToggle: (id: string) => void
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
}: InferredProblemsReviewProps) {
  const { t } = useLanguage()
  const x = t.ipsExport
  const p = x.inferredProblems

  return (
    <div className="space-y-3 rounded-md border border-violet-200 bg-violet-50/40 p-3 dark:border-violet-900 dark:bg-violet-950/20">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-violet-500" />
          {p.title}
        </div>
        <Button
          onClick={onRun}
          disabled={!available || status === 'loading'}
          size="sm"
          variant="outline"
          className="h-7 text-xs"
        >
          {status === 'loading' ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="mr-1 h-3.5 w-3.5" />
          )}
          {status === 'ready' || status === 'error' ? p.rerun : p.run}
        </Button>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">{p.disclaimer}</p>

      {!available && <p className="text-xs text-amber-700 dark:text-amber-400">{p.noKeyHint}</p>}

      {status === 'loading' && (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {p.loading}
        </div>
      )}

      {status === 'error' &&
        (error === 'no-key' ? (
          <p className="text-xs text-destructive">{p.noKeyHint}</p>
        ) : (
          <div className="space-y-0.5">
            <p className="text-xs text-destructive">{p.error}</p>
            {error && <p className="break-words text-[11px] text-destructive/80">{error}</p>}
          </div>
        ))}

      {status === 'ready' && problems.length === 0 && (
        <p className="py-2 text-xs text-muted-foreground">{p.empty}</p>
      )}

      {status === 'ready' && problems.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{p.confirmHint}</span>
            <span className="font-medium text-violet-700 dark:text-violet-300">
              {p.confirmedCount.replace('{count}', String(confirmedCount))}
            </span>
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

  return (
    <div className="rounded-md border bg-background px-2.5 py-2">
      <div className="flex items-start gap-2">
        <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-0.5" aria-label={main} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium">{main}</span>
            {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <ConfidenceBadge confidence={problem.inferenceConfidence} />
            <CodingBadge problem={problem} />
          </div>
          {problem.needsManualCoding && (
            <p className="mt-1 text-[10px] leading-relaxed text-amber-700 dark:text-amber-400">
              {p.codingManualHint}
            </p>
          )}
        </div>
      </div>

      {(problem.evidence.length > 0 || problem.rationale) && (
        <div className="mt-1.5 pl-6">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {open ? p.hideEvidence : p.showEvidence}
          </button>
          {open && (
            <div className="mt-1 space-y-1.5 border-l-2 border-muted pl-2 text-[11px]">
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
          )}
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
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${styles[confidence]}`}>
      {labels[confidence]}
    </span>
  )
}

function CodingBadge({ problem }: { problem: InferredProblem }) {
  const { t } = useLanguage()
  const p = t.ipsExport.inferredProblems

  if (problem.needsManualCoding) {
    return (
      <span
        title={p.codingManualHint}
        className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
      >
        <AlertTriangle className="h-3 w-3" />
        {p.codingManual}
        {problem.coding?.code ? ` · ${problem.coding.code}` : ''}
      </span>
    )
  }
  if (problem.coding) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
        <BadgeCheck className="h-3 w-3" />
        {p.codingVerified} · {problem.coding.code}
      </span>
    )
  }
  return (
    <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      {p.codingNone}
    </span>
  )
}
