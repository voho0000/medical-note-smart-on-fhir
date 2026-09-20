"use client"

import { useEffect, useMemo } from 'react'
import { Check, LoaderCircle, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/src/shared/utils/cn.utils'
import { TherapyResponseChart } from './TherapyResponseChart'
import type { CdssCoverageCheck, CdssCoverageSummary } from '../types'
import {
  selectNhiLipidAiCriteria,
  type NhiLipidAiDecision,
  type NhiLipidAiSuggestion,
} from '../ai/nhi-lipid-ai-assist'
import {
  useNhiLipidAiAssist,
  type NhiLipidAiAssist,
} from '../hooks/use-nhi-lipid-ai-assist.hook'
import {
  useNhiLipidReviewProvenance,
  type NhiLipidAnswerProvenance,
  type NhiLipidAnswerProvenanceById,
} from '../stores/nhi-lipid-review.store'

/**
 * 表一 as the published table draws it, with this patient's position on it.
 *
 * The screen a clinician already knows: five tier columns, each listing the
 * criteria that put a patient in it, and the two thresholds underneath. What
 * this adds is which criteria the record can speak to — lit — and which it
 * cannot, which stay open circles. An open circle is 「查不到」, never 「沒有」,
 * and that distinction is the whole reason the panel exists: a tier read one
 * row too low denies a covered statin, one row too high claims coverage the
 * record cannot support.
 *
 * Every string here comes from the pack, including each clause's bracket. The
 * only thing this file decides is where a criterion sits on screen.
 */

/** The 表一 columns, left to right, as the published table orders them. */
const COLUMNS = ['low', 'moderate', 'high', 'very-high', 'extreme'] as const

/** A single-hue ramp: order without implying clinical alarm. */
const TINT: Record<string, string> = {
  low: 'bg-primary/5',
  moderate: 'bg-primary/10',
  high: 'bg-primary/20',
  'very-high': 'bg-primary/30',
  extreme: 'bg-primary/45',
}

const MARK: Record<CdssCoverageCheck['state'], { glyph: string; lit: boolean }> = {
  yes: { glyph: '●', lit: true },
  no: { glyph: '–', lit: false },
  unknown: { glyph: '○', lit: false },
}

/** 表一 prints a number; the pack formats it. Read it back for the bar height. */
function threshold(initiation: string): number {
  const digits = initiation.replace(/[^0-9]/g, '')
  return digits ? Number(digits) : 0
}

const ANSWER_LABEL: Record<CdssCoverageCheck['state'], [zh: string, en: string]> = {
  yes: ['符合', 'Met'],
  no: ['不符合', 'Not met'],
  unknown: ['未確認', 'Unconfirmed'],
}

type ProvenanceKind = 'record' | 'ai' | 'manual-modified' | 'manual-selected'

const PROVENANCE_STYLE: Record<ProvenanceKind, string> = {
  record: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200',
  ai: 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-200',
  'manual-modified': 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200',
  'manual-selected': 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200',
}

function ProvenanceBadge({
  kind,
  isEnglish,
  testId,
}: {
  kind: ProvenanceKind
  isEnglish: boolean
  testId?: string
}) {
  const label: Record<ProvenanceKind, [zh: string, en: string]> = {
    record: ['自動帶入', 'Record autofill'],
    ai: ['AI 判讀', 'AI assessment'],
    'manual-modified': ['醫師修改', 'Clinician changed'],
    'manual-selected': ['醫師選擇', 'Clinician selected'],
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-medium leading-none',
        PROVENANCE_STYLE[kind],
      )}
      data-testid={testId}
    >
      <span aria-hidden="true">{kind === 'record' ? '●' : kind === 'ai' ? '✦' : kind === 'manual-modified' ? '↺' : '✓'}</span>
      {label[kind][isEnglish ? 1 : 0]}
    </span>
  )
}

/**
 * One 表一 criterion: a mark, the clause's label, and what the record says.
 *
 * The clause's bracket and the clinician's answer live behind one press rather
 * than on the row. Twenty-six criteria each carrying three answer buttons is a
 * screen that asks everything and is read by nobody; the tier only moves on a
 * few of them, and those are the ones a clinician opens.
 */
function Criterion({
  check,
  isEnglish,
  onAnswer,
  aiSuggestion,
  aiDecision,
  answerProvenance,
}: {
  check: CdssCoverageCheck
  isEnglish: boolean
  onAnswer?: (
    id: string,
    state: CdssCoverageCheck['state'] | undefined,
    provenance?: NhiLipidAnswerProvenance,
  ) => void
  aiSuggestion?: NhiLipidAiSuggestion
  aiDecision?: NhiLipidAiDecision
  answerProvenance?: NhiLipidAnswerProvenance
}) {
  const mark = MARK[check.state]
  const fromCode = check.state === 'yes' && check.origin === 'record'
  const aiApplied = check.origin === 'physician' && answerProvenance?.source === 'ai'
  const manuallyChanged = check.origin === 'physician' && !aiApplied
  const provenanceKind: ProvenanceKind | undefined = aiApplied
    ? 'ai'
    : manuallyChanged
      ? answerProvenance?.manualAction === 'selected' ? 'manual-selected' : 'manual-modified'
      : check.origin === 'record' && check.state !== 'unknown'
        ? 'record'
        : undefined
  const glyph = manuallyChanged ? '✓' : fromCode && check.evidenceKind !== 'measurement' ? '◐' : mark.glyph
  const states: readonly CdssCoverageCheck['state'][] = ['yes', 'no', 'unknown']
  const interactive = Boolean(onAnswer && check.editable) || Boolean(check.detail)
  const recordState = answerProvenance?.recordState
    ?? (check.origin === 'record' ? check.state : undefined)
  const overridesAi = answerProvenance?.source === 'ai' || answerProvenance?.overrides === 'ai'
  const answerManually = (state: CdssCoverageCheck['state']) => {
    if (!onAnswer) return
    const confirmsRecordCode = !answerProvenance
      && check.origin === 'record'
      && check.evidenceKind === 'code'
      && check.state === 'yes'
      && state === check.state
    // Re-clicking an already reviewed answer is a no-op. The exception is a
    // record-code positive: clicking its preselected 「符合」 is the explicit
    // clinical confirmation the ◐ marker says is still missing.
    if (state === check.state && !confirmsRecordCode) return
    // Selecting the record's original value is a restore, not another manual
    // assertion. An AI override is the exception: choosing the record value is
    // still a clinician correction of that AI assessment and remains visible.
    // Confirming a record code is also not a restore: its value stays yes while
    // its evidence layer changes from claim support to explicit review.
    if (recordState !== undefined && state === recordState && !overridesAi && !confirmsRecordCode) {
      onAnswer(check.id, undefined)
      return
    }
    const manualAction = confirmsRecordCode || (!overridesAi && recordState === 'unknown')
      ? 'selected'
      : 'modified'
    onAnswer(check.id, state, {
      source: 'manual',
      manualAction,
      ...(recordState !== undefined ? { recordState } : {}),
      overrides: overridesAi ? 'ai' : 'record',
    })
  }

  const body = (
    <>
      <span
        aria-hidden="true"
        className={cn('w-3 shrink-0 font-semibold', mark.lit ? 'text-primary' : 'text-muted-foreground/70')}
      >
        {glyph}
      </span>
      <span className="min-w-0 flex-1 space-y-0.5 text-left">
        <span
          className={cn(
            'block',
            mark.lit ? 'font-medium text-foreground' : 'text-muted-foreground',
            check.detail && 'underline decoration-dotted decoration-muted-foreground/50 underline-offset-4',
          )}
        >
          {check.label}
        </span>
        <span className={cn('block text-xs tabular-nums', mark.lit ? 'text-primary' : 'text-muted-foreground')}>
          {check.value}
          {provenanceKind ? (
            <span className="ml-1 inline-block">
              <ProvenanceBadge
                kind={provenanceKind}
                isEnglish={isEnglish}
                testId={`nhi-criterion-provenance-${check.id}`}
              />
            </span>
          ) : null}
        </span>
        {aiSuggestion && aiSuggestion.state !== 'unknown' && (aiApplied || !aiDecision) ? (
          <span className="mt-1 flex items-center gap-1 text-xs font-medium text-primary">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            {isEnglish
              ? `AI assessed ${aiSuggestion.state === 'yes' ? 'met' : 'not met'} · included in tier`
              : `AI 判讀${aiSuggestion.state === 'yes' ? '符合' : '不符合'} · 已納入分級`}
          </span>
        ) : null}
      </span>
    </>
  )

  if (!interactive) {
    return <div className="flex gap-2 py-1.5 text-[13px] leading-relaxed">{body}</div>
  }

  return (
    <Popover>
      <PopoverTrigger
        className="flex w-full gap-2 rounded-sm py-1.5 text-[13px] leading-relaxed hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={check.label}
      >
        {body}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 text-xs leading-relaxed">
        <div className="space-y-1">
          <p className="text-sm font-medium">{check.label}</p>
          {check.detail ? <p className="text-muted-foreground">{check.detail}</p> : null}
          <p className="tabular-nums text-muted-foreground">{check.value}</p>
        </div>
        {onAnswer && check.editable ? (
          <div className="space-y-2 border-t border-border pt-2">
            <p className="text-muted-foreground">
              {isEnglish
                ? 'A change recalculates the tier immediately and overrides the AI assessment for this visit.'
                : '修改後立即重新計算分級，並覆蓋本次看診的 AI 判讀。'}
            </p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={check.label}>
              {states.map((state) => (
                <button
                  key={state}
                  type="button"
                  aria-pressed={check.state === state}
                  onClick={() => answerManually(state)}
                  className={cn(
                    'min-h-11 flex-1 rounded-md border px-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    check.state === state
                      ? 'border-primary bg-primary/10 font-medium text-primary'
                      : 'border-border hover:bg-muted/40',
                  )}
                >
                  {isEnglish ? ANSWER_LABEL[state][1] : ANSWER_LABEL[state][0]}
                </button>
              ))}
            </div>
            {check.origin === 'physician' ? (
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => onAnswer(check.id, undefined)}
              >
                {isEnglish ? 'Restore the record reading' : '恢復資料判讀'}
              </button>
            ) : null}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

const AI_STATE_LABEL: Record<NhiLipidAiSuggestion['state'], [zh: string, en: string]> = {
  yes: ['判讀符合', 'Assessed met'],
  no: ['判讀不符合', 'Assessed not met'],
  unknown: ['仍無法判斷', 'Still unknown'],
}

const AI_CONFIDENCE_LABEL: Record<NhiLipidAiSuggestion['confidence'], [zh: string, en: string]> = {
  high: ['高信心', 'High confidence'],
  medium: ['中信心', 'Medium confidence'],
  low: ['低信心', 'Low confidence'],
}

function AiSuggestionCard({
  suggestion,
  check,
  isEnglish,
}: {
  suggestion: NhiLipidAiSuggestion
  check?: CdssCoverageCheck
  isEnglish: boolean
}) {
  return (
    <article
      className="space-y-2 rounded-md border border-border bg-background p-3"
      data-testid={`nhi-lipid-ai-suggestion-${suggestion.criterionId}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold">{check?.label ?? suggestion.criterionId}</p>
        <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
          {AI_STATE_LABEL[suggestion.state][isEnglish ? 1 : 0]}
        </Badge>
        <span className="text-[11px] text-muted-foreground">
          {AI_CONFIDENCE_LABEL[suggestion.confidence][isEnglish ? 1 : 0]}
        </span>
      </div>
      {suggestion.rationale ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{suggestion.rationale}</p>
      ) : null}
      {suggestion.evidence.map((evidence) => (
        <blockquote
          key={`${evidence.sourceKey}-${evidence.excerpt}`}
          className="space-y-1 border-l-2 border-primary/40 pl-3 text-xs leading-relaxed"
        >
          <p>「{evidence.excerpt}」</p>
          <footer className="text-[11px] text-muted-foreground">
            {evidence.sourceLabel}{evidence.date ? ` · ${evidence.date}` : ''}
          </footer>
        </blockquote>
      ))}
      <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
        <Check className="h-4 w-4" aria-hidden="true" />
        {isEnglish
          ? 'Included in the tier automatically. Select the criterion below only if it needs correction.'
          : '已自動納入風險分級；僅在需要更正時點選下方表一條件。'}
      </p>
    </article>
  )
}

function NhiLipidAiReview({
  ai,
  checks,
  reviewableCount,
  patientId,
  isEnglish,
  onAnswer,
}: {
  ai: NhiLipidAiAssist
  checks: readonly CdssCoverageCheck[]
  reviewableCount: number
  patientId?: string
  isEnglish: boolean
  onAnswer?: (
    id: string,
    state: CdssCoverageCheck['state'] | undefined,
    provenance?: NhiLipidAnswerProvenance,
  ) => void
}) {
  const suggestions = ai.suggestions
  const decisions = ai.decisions
  const decide = ai.decide
  const checkById = useMemo(
    () => new Map(checks.map((check) => [check.id, check])),
    [checks],
  )
  const allSuggestions = Object.values(suggestions)
  const decisive = allSuggestions.filter((suggestion) => suggestion.state !== 'unknown')
  const unknown = allSuggestions.filter((suggestion) => suggestion.state === 'unknown')
  const disabled = !patientId || !onAnswer || !ai.isDataReady || ai.isRunning || reviewableCount === 0

  useEffect(() => {
    if (!onAnswer) return
    for (const suggestion of Object.values(suggestions)) {
      if (suggestion.state === 'unknown' || decisions[suggestion.criterionId]) continue
      onAnswer(suggestion.criterionId, suggestion.state, {
        source: 'ai',
        recordState: checkById.get(suggestion.criterionId)?.state,
        modelId: suggestion.modelId,
        modelName: suggestion.modelName,
        generatedAt: suggestion.generatedAt,
        confidence: suggestion.confidence,
      })
      decide(suggestion.criterionId, 'applied')
    }
  }, [checkById, decide, decisions, onAnswer, suggestions])

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3" data-testid="nhi-lipid-ai-review">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            {isEnglish ? 'AI-assisted evidence review' : 'AI 協助判讀'}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {isEnglish
              ? 'Runs on click. Traceable AI assessments are included in the tier automatically; change only rows that need correction.'
              : '點擊後直接判讀；有可回查證據的結果會自動納入分級，醫師只需修正不正確的項目。'}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={disabled}
          className="min-h-11 gap-1.5 px-3 shadow-none"
          data-testid="nhi-lipid-ai-run"
          onClick={() => { void ai.run() }}
        >
          {ai.isRunning
            ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            : <Sparkles className="h-4 w-4" aria-hidden="true" />}
          {ai.isRunning
            ? isEnglish ? 'Reviewing…' : 'AI 判讀中…'
            : allSuggestions.length > 0
              ? isEnglish ? 'Review again' : '重新判讀'
              : isEnglish ? 'Start AI review' : 'AI 協助判讀'}
        </Button>
      </div>

      {!ai.isDataReady && patientId ? (
        <p className="text-xs text-muted-foreground" role="status">
          {isEnglish ? 'Preparing the selected clinical data…' : '正在準備目前選定的病歷資料…'}
        </p>
      ) : null}
      {ai.isRunning ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          {isEnglish ? 'Comparing the record with each Table 1 criterion…' : '正在逐項比對病歷與表一條件…'}
        </p>
      ) : null}
      {ai.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
          {ai.error}
        </p>
      ) : null}

      {allSuggestions.length > 0 ? (
        <div className="space-y-3" aria-live="polite">
          <p className="text-xs font-medium">
            {isEnglish
              ? `${decisive.length} assessments included automatically; ${unknown.length} remain unknown.`
              : `${decisive.length} 項已自動納入分級；${unknown.length} 項仍無法判斷。`}
          </p>
          <div className="grid gap-2 lg:grid-cols-2">
            {decisive.map((suggestion) => (
              <AiSuggestionCard
                key={suggestion.criterionId}
                suggestion={suggestion}
                check={checkById.get(suggestion.criterionId)}
                isEnglish={isEnglish}
              />
            ))}
          </div>
          {unknown.length > 0 ? (
            <details className="rounded-md border border-border bg-background px-3">
              <summary className="min-h-11 cursor-pointer py-3 text-xs font-medium text-primary">
                {isEnglish ? `Why ${unknown.length} items remain unknown` : `查看 ${unknown.length} 項仍待補資料原因`}
              </summary>
              <div className="space-y-2 border-t border-border py-3">
                {unknown.map((suggestion) => (
                  <div key={suggestion.criterionId} className="text-xs leading-relaxed">
                    <p className="font-medium">{checkById.get(suggestion.criterionId)?.label ?? suggestion.criterionId}</p>
                    <p className="text-muted-foreground">
                      {suggestion.rationale}
                      {suggestion.missing.length > 0 ? ` ${suggestion.missing.join('；')}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
          <p className="text-[11px] text-muted-foreground">
            {isEnglish
              ? `Generated by ${allSuggestions[0]?.modelName}. Evidence excerpts must be checked against the source record.`
              : `由 ${allSuggestions[0]?.modelName} 產生；引用片段仍須回查原始病歷。`}
          </p>
        </div>
      ) : null}
    </div>
  )
}

export interface NhiTable1PanelProps {
  summary: CdssCoverageSummary
  locale: string
  patientId?: string
  onAnswer?: (
    id: string,
    state: CdssCoverageCheck['state'] | undefined,
    provenance?: NhiLipidAnswerProvenance,
  ) => void
  answerProvenance?: NhiLipidAnswerProvenanceById
  /** Development/review injection. Production omits this and uses the
   * patient-scoped connected wrapper below. */
  aiAssist?: NhiLipidAiAssist
}

function NhiTable1PanelContent({
  summary,
  locale,
  patientId,
  onAnswer,
  answerProvenance,
  aiAssist,
}: NhiTable1PanelProps) {
  const isEnglish = locale === 'en'
  const allChecks = [...summary.factors, ...summary.metabolicChecks, ...summary.diseaseChecks]
  const tiers = COLUMNS.map((id) => summary.tiers.find((tier) => tier.id === id)).filter(
    (tier): tier is CdssCoverageSummary['tiers'][number] => Boolean(tier),
  )
  if (tiers.length === 0) return null

  const tallest = Math.max(...tiers.map((tier) => threshold(tier.initiation)), 1)
  const selected = tiers.find((tier) => tier.selected)
  const forTier = (id: string) => summary.diseaseChecks.filter((check) => check.tier === id)
  const groupsOf = (id: string) => {
    const checks = forTier(id)
    const order: string[] = []
    for (const check of checks) {
      const key = check.group ?? ''
      if (!order.includes(key)) order.push(key)
    }
    return order.map((key) => ({ key, checks: checks.filter((check) => (check.group ?? '') === key) }))
  }
  const criterionProps = (check: CdssCoverageCheck) => ({
    aiSuggestion: aiAssist?.suggestions[check.id],
    aiDecision: aiAssist?.decisions[check.id],
    answerProvenance: answerProvenance?.[check.id],
  })

  return (
    <section className="space-y-3 px-3 pb-4" aria-label={summary.title} data-testid="nhi-table1-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-semibold">{summary.conclusion}</p>
        <a
          className="text-xs text-primary underline underline-offset-2"
          href={summary.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          {summary.source}
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
        <span className="font-medium text-muted-foreground">{isEnglish ? 'Status' : '狀態'}</span>
        <span><span className="font-semibold text-primary">●</span> {isEnglish ? 'Met' : '符合'}</span>
        <span><span className="font-semibold text-primary">◐</span> {isEnglish ? 'Claims code; confirm clinically' : '申報碼支持，須臨床確認'}</span>
        <span className="text-muted-foreground"><span className="font-semibold">○</span> {isEnglish ? 'Not in the record — unknown, not absent' : '紀錄讀不到 — 未知，不等於沒有'}</span>
        <span className="text-muted-foreground"><span className="font-semibold">–</span> {isEnglish ? 'Measured and not met' : '有數值且不符合'}</span>
        <span className="h-4 w-px bg-border" aria-hidden="true" />
        <span className="font-medium text-muted-foreground">{isEnglish ? 'Source' : '來源'}</span>
        <ProvenanceBadge kind="record" isEnglish={isEnglish} />
        <ProvenanceBadge kind="ai" isEnglish={isEnglish} />
        <ProvenanceBadge kind="manual-modified" isEnglish={isEnglish} />
        <ProvenanceBadge kind="manual-selected" isEnglish={isEnglish} />
      </div>

      {aiAssist ? (
        <NhiLipidAiReview
          ai={aiAssist}
          checks={allChecks}
          reviewableCount={selectNhiLipidAiCriteria(allChecks).length}
          patientId={patientId}
          isEnglish={isEnglish}
          onAnswer={onAnswer}
        />
      ) : null}

      <div className="overflow-x-auto">
        <div className="grid min-w-[66rem] grid-cols-[5rem_repeat(5,minmax(0,1fr))] gap-2">
          <div className="self-end pb-2 text-right text-xs font-medium leading-snug">
            {isEnglish ? 'Criteria' : '表一條件'}
          </div>
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className={cn(
                'rounded-t-md px-3 py-2 text-center text-base font-semibold',
                TINT[tier.id],
                tier.selected && 'ring-2 ring-inset ring-primary',
              )}
            >
              {tier.label}
              {tier.selected ? (
                <span className="ml-2 rounded border border-primary bg-background px-1.5 py-0.5 align-middle text-[11px] font-medium text-primary">
                  {tier.status}
                </span>
              ) : null}
            </div>
          ))}

          <div aria-hidden="true" />
          <div className="col-span-2 space-y-2 rounded-b-md border border-t-0 border-border bg-card p-3">
            <p className="text-center text-xs font-medium leading-relaxed">
              {isEnglish
                ? 'One risk factor is low risk; two or more is moderate risk.'
                : '若帶有一項風險因子，為低風險；若帶有兩項以上，則為中風險'}
            </p>
            <div className="grid gap-x-4 sm:grid-cols-2">
              {summary.factors.map((check) => (
                <Criterion key={check.id} check={check} isEnglish={isEnglish} onAnswer={onAnswer} {...criterionProps(check)} />
              ))}
            </div>
            <details className="border-t border-border pt-1">
              <summary className="min-h-11 cursor-pointer py-2 text-xs font-medium text-primary">
                {isEnglish ? 'Metabolic syndrome components' : '代謝性症候群五項細節'}
              </summary>
              <div className="grid gap-x-4 sm:grid-cols-2">
                {summary.metabolicChecks.map((check) => (
                  <Criterion key={check.id} check={check} isEnglish={isEnglish} onAnswer={onAnswer} {...criterionProps(check)} />
                ))}
              </div>
            </details>
          </div>

          {(['high', 'very-high', 'extreme'] as const).map((id) => (
            <div key={id} className="space-y-1 rounded-b-md border border-t-0 border-border bg-card p-3">
              {groupsOf(id).map((group) => (
                <div key={group.key} className="space-y-0.5">
                  {group.key ? (
                    <p className="pt-1 text-xs font-semibold leading-snug">{group.key}</p>
                  ) : null}
                  {group.checks.map((check) => (
                    <Criterion key={check.id} check={check} isEnglish={isEnglish} onAnswer={onAnswer} {...criterionProps(check)} />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[66rem] space-y-2">
          <div className="grid grid-cols-[5rem_repeat(5,minmax(0,1fr))] items-end gap-2">
            <p className="pb-1 text-right text-xs font-medium leading-snug">
              {isEnglish ? <>LDL-C<br />goal</> : '治療目標值'}
              <span className="block font-normal text-muted-foreground">mg/dL</span>
            </p>
            {tiers.map((tier) => (
              <div key={tier.id} className="flex flex-col items-center gap-1">
                <span className={cn('text-xl font-bold tabular-nums', tier.selected && 'text-primary')}>
                  {tier.target.split(' / ')[0]}
                </span>
                <div
                  className={cn('w-full rounded-t border border-border', TINT[tier.id], tier.selected && 'ring-2 ring-inset ring-primary')}
                  style={{ height: `${Math.round((threshold(tier.initiation) / tallest) * 108)}px` }}
                />
                <span className={cn('text-[11px] tabular-nums', tier.selected ? 'font-medium text-primary' : 'text-muted-foreground')}>
                  {tier.targetMet === undefined
                    ? isEnglish ? 'No LDL-C on record' : '紀錄無 LDL-C'
                    : tier.targetMet
                      ? isEnglish ? 'At goal' : '已達標'
                      : isEnglish ? 'Above goal' : '未達標'}
                </span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-[5rem_repeat(5,minmax(0,1fr))] items-stretch gap-2">
            <p className="pt-2 text-right text-xs font-medium leading-snug">
              {isEnglish ? <>Drug<br />initiation</> : <>起始藥物<br />治療血脂值</>}
            </p>
            {tiers.map((tier) => (
              <div
                key={tier.id}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-md border px-2 py-2',
                  tier.selected ? 'border-primary bg-primary/10' : 'border-border bg-muted/30',
                )}
              >
                <span className={cn('text-base font-semibold tabular-nums', tier.selected && 'text-primary')}>
                  {tier.initiation}
                </span>
                <span className={cn('text-[11px] tabular-nums', tier.selected ? 'font-medium text-primary' : 'text-muted-foreground')}>
                  {tier.initiationReached === undefined
                    ? '—'
                    : tier.initiationReached
                      ? isEnglish ? 'Reached' : '已達起始值'
                      : isEnglish ? 'Not reached' : '未達起始值'}
                </span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-[5rem_repeat(5,minmax(0,1fr))] items-stretch gap-2">
            <p className="pt-2 text-right text-xs font-medium leading-snug">
              {isEnglish ? 'Prescribing' : '處方規定'}
              <span className="block font-normal text-primary">
                {isEnglish ? 'lit = allowed' : '亮＝允許'}
              </span>
            </p>
            {tiers.map((tier) => (
              <div
                key={tier.id}
                className={cn(
                  'space-y-1 rounded-md border p-2',
                  tier.selected ? 'border-primary bg-card' : 'border-border bg-muted/30',
                )}
              >
                {(tier.prescribing ?? []).map((step) => (
                  <Popover key={step.text}>
                    <PopoverTrigger
                      className={cn(
                        'flex w-full gap-1.5 rounded px-2 py-1 text-left text-xs leading-snug hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        step.state === 'yes'
                          ? 'bg-primary/10 font-medium text-foreground'
                          : step.state === 'no'
                            ? 'text-muted-foreground/70 line-through decoration-muted-foreground/40'
                            : 'text-muted-foreground',
                      )}
                    >
                      <span aria-hidden="true" className={cn('shrink-0 font-semibold', step.state === 'yes' ? 'text-primary' : 'text-muted-foreground/70')}>
                        {MARK[step.state].glyph}
                      </span>
                      <span className="min-w-0">{step.text}</span>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-72 space-y-1 text-xs leading-relaxed">
                      <p className="text-sm font-medium">{step.text}</p>
                      <p className="text-primary">
                        {step.state === 'yes'
                          ? isEnglish ? 'Supported by the record' : '紀錄支持走到這一階'
                          : step.state === 'no'
                            ? isEnglish ? 'Not reached' : '尚未走到這一階'
                            : isEnglish ? 'The record cannot say' : '紀錄無法判讀'}
                      </p>
                      {step.evidence ? <p className="text-muted-foreground">{step.evidence}</p> : null}
                    </PopoverContent>
                  </Popover>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {summary.therapy ? (
        <div className="space-y-2 rounded-md border border-border bg-card px-3 py-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
            <span className="font-medium text-muted-foreground">{summary.therapy.label}</span>
            <span className="font-medium tabular-nums">{summary.therapy.value}</span>
            {summary.therapy.duration ? (
              <span className="tabular-nums text-primary">{summary.therapy.duration}</span>
            ) : null}
          </div>
          <TherapyResponseChart
            therapy={summary.therapy}
            goal={selected ? threshold(selected.initiation) : undefined}
            locale={locale}
          />
          {summary.therapy.timeline && summary.therapy.timeline.length > 0 ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {isEnglish
                ? 'Prescribing and laboratory records. A span ends at its last prescription, not at a stop; a daily dose appears only where the prescription stated one; and the left edge is where the data window begins, not where treatment did.'
                : '為處方與檢驗紀錄。一段的結束是最後一筆處方，不代表停藥；每日劑量只在處方本身寫明時顯示；左端是資料窗起點，不是療程起點。'}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-1 border-t border-border pt-3">
        <p className="text-xs font-medium">{isEnglish ? 'Pending verification' : '待核對與可能升級條件'}</p>
        <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground">
          {summary.caveats.map((caveat) => (
            <li key={caveat}>{caveat}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function ConnectedNhiTable1Panel(props: NhiTable1PanelProps & { patientId: string }) {
  const storedProvenance = useNhiLipidReviewProvenance(props.patientId)
  const answerProvenance = props.answerProvenance ?? storedProvenance
  const criteria = useMemo(() => {
    const checks = [
      ...props.summary.factors,
      ...props.summary.metabolicChecks,
      ...props.summary.diseaseChecks,
    ]
    const selected = selectNhiLipidAiCriteria(checks)
    const selectedIds = new Set(selected.map((check) => check.id))
    for (const check of checks) {
      if (check.editable && answerProvenance[check.id]?.source === 'ai' && !selectedIds.has(check.id)) {
        selected.push(check)
      }
    }
    return selected
  }, [answerProvenance, props.summary.diseaseChecks, props.summary.factors, props.summary.metabolicChecks])
  const aiAssist = useNhiLipidAiAssist({
    patientId: props.patientId,
    criteria,
    locale: props.locale,
  })
  return <NhiTable1PanelContent {...props} aiAssist={aiAssist} answerProvenance={answerProvenance} />
}

/**
 * Keep the renderer usable in development fixtures and static reviews without
 * mounting the application's patient/AI providers. The live CDSS always passes
 * a patient id and therefore takes the connected branch.
 */
export function NhiTable1Panel(props: NhiTable1PanelProps) {
  if (props.aiAssist) return <NhiTable1PanelContent {...props} />
  if (props.patientId) return <ConnectedNhiTable1Panel {...props} patientId={props.patientId} />
  return <NhiTable1PanelContent {...props} />
}
