"use client"

import { type ReactNode, useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronDown,
  Circle,
  CircleDashed,
  ClipboardList,
  Copy,
  ListChecks,
  PencilLine,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/src/shared/utils/cn.utils'
import { GROUP_TONES } from '@/src/shared/constants/group-tones'
import { useCopyToClipboard } from '@/src/shared/hooks/use-copy-to-clipboard'
import type { CdssRecommendation } from '../types'
import {
  NOT_ASSESSED,
  todayIsoDate,
  type ClinicVitals,
  type ClinicVitalsPatch,
  type CompensationAnswerValue,
  type NyhaAnswerValue,
  type SignAnswerValue,
} from '../stores/clinic-vitals.store'
import { HFPEF_NOT_CONFIRMED, type PhenotypeAnswer } from '../stores/phenotype-answer.store'
import type {
  PhysicianDecisionInput,
} from '../stores/physician-decisions.store'
import { diagnosticSummaryOf, type DiagnosticSummary } from '../physician-input-contract'
import type { HfpefInputsPatch } from '../stores/hfpef-inputs.store'
import {
  HFPEF_CALCULATOR_VERSION,
  type HfpefReading,
  type HfpefScoreReading,
} from '../utils/hfpef-scores'
import { HfpefInputsDialog } from './HfpefInputsDialog'
import { CareTimeline } from './CareTimeline'
import { ClinicalHandoffCard } from './ClinicalHandoffCard'
import { ClinicVitalsForm } from './ClinicVitalsForm'
import { DiagnosisReading } from './DiagnosisReading'
import { PhysicianInputRequestPanel } from './PhysicianInputRequestPanel'
import { PhysicianDecisionControls as DecisionControls } from './PhysicianDecisionControls'
import { statusLabel, statusStyle, StatusIcon } from './status-presentation'
import {
  VISIT_SIDE_LABELS,
  formatDay,
  formatStamp,
  type HeartFailureVisitFlow as VisitFlowModel,
  type VisitActionGroupId,
  type VisitNextStepTarget,
  type VisitQuestion,
  type VisitQuestionId,
  type VisitSignItem,
  type VisitSignSide,
  type VisitStep,
} from './heart-failure-visit-flow'
import type { HeartFailureBoardModel, HeartFailureMetric } from './heart-failure-board'

/** The element a step's 「前往」 button scrolls to. */
export function visitQuestionElementId(questionId: VisitQuestionId): string {
  return `cdss-hf-question-${questionId}`
}

export function visitActionElementId(moduleId: string): string {
  return `cdss-hf-action-${moduleId}`
}

/**
 * Takes the reader to what the next step names.
 *
 * A DOM lookup rather than a ref map: the target can be inside a folded group
 * or a card the reader has not opened, and the id is the one contract every
 * one of those renderings already shares.
 */
export function focusVisitFlowTarget(target: VisitNextStepTarget): void {
  if (typeof document === 'undefined') return
  const id = target.kind === 'question'
    ? visitQuestionElementId(target.questionId)
    : target.kind === 'action'
      ? visitActionElementId(target.moduleId)
      : undefined
  if (!id) return
  const element = document.getElementById(id)
  if (!element) return
  element.scrollIntoView({ block: 'center', behavior: 'smooth' })
  const focusable = element.querySelector<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )
  focusable?.focus()
}

const GROUP_PRESENTATION: Readonly<Record<VisitActionGroupId, { toneClass: string; dividerClass: string }>> = {
  safety: GROUP_TONES.rose,
  actionable: GROUP_TONES.indigo,
  'needs-data': GROUP_TONES.orange,
  review: GROUP_TONES.blue,
  'no-action': GROUP_TONES.teal,
}

/** The colour of the 3px bar down the left of a row: its status. */
const ROW_BAR_CLASS: Readonly<Record<VisitActionGroupId, string>> = {
  safety: 'bg-amber-500',
  actionable: 'bg-primary',
  'needs-data': 'bg-orange-400',
  review: 'bg-blue-400',
  'no-action': 'bg-emerald-400',
}

/** The measurements this stage can take back from the clinician. */
const REFILLABLE_FACT_KEYS: readonly string[] = ['bloodPressure', 'heartRate', 'bodyWeight']

export interface HeartFailureVisitFlowProps {
  flow: VisitFlowModel
  board: HeartFailureBoardModel
  isEnglish: boolean
  now: Date
  /** Which recommendation's detail is open, shared with the module list's state. */
  expandedId: string | null
  onToggle: (id: string) => void
  /** The same decision detail every other surface opens. */
  renderDetail: (recommendation: CdssRecommendation) => ReactNode
  clinicVitals?: ClinicVitals
  onSaveClinicVitals?: (patch: ClinicVitalsPatch) => void
  onClearClinicVitals?: () => void
  phenotypeAnswer?: PhenotypeAnswer
  onAnswerPhenotype?: (answer: PhenotypeAnswer) => void
  onRecordDecision?: (moduleId: string, input: PhysicianDecisionInput) => void
  onClearDecision?: (moduleId: string) => void
  /** The host's own HFpEF calculator reading, where the pathway raised one. */
  hfpefReading?: HfpefReading
  onSaveHfpefInputs?: (patch: HfpefInputsPatch) => void
  packVersion: string
}

export function HeartFailureVisitFlow({
  flow,
  board,
  isEnglish,
  now,
  expandedId,
  onToggle,
  renderDetail,
  clinicVitals,
  onSaveClinicVitals,
  onClearClinicVitals,
  phenotypeAnswer,
  onAnswerPhenotype,
  onRecordDecision,
  onClearDecision,
  hfpefReading,
  onSaveHfpefInputs,
  packVersion,
}: HeartFailureVisitFlowProps) {
  const [vitalsFormOpen, setVitalsFormOpen] = useState(false)
  const [calculatorOpen, setCalculatorOpen] = useState(false)
  const [vitalsScopeNote, setVitalsScopeNote] = useState<string | undefined>(undefined)
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<VisitActionGroupId>>(
    () => new Set(flow.actionGroups
      .filter((group) => group.collapsedByDefault)
      .map((group) => group.id)),
  )
  const [editingDecisions, setEditingDecisions] = useState<ReadonlySet<string>>(new Set())

  const openVitalsForm = (scopeNote?: string) => {
    setVitalsScopeNote(scopeNote)
    setVitalsFormOpen(true)
    if (typeof document !== 'undefined') {
      document.getElementById(visitQuestionElementId('clinic-vitals'))
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }

  return (
    <div className="space-y-3" data-testid="cdss-hf-visit-flow">
      <StepCard
        steps={flow.steps}
        nextStep={flow.nextStep}
        isEnglish={isEnglish}
        onGo={() => {
          if (flow.nextStep.target.kind === 'copy') return
          focusVisitFlowTarget(flow.nextStep.target)
        }}
        summaryText={flow.summaryText}
      />

      <RecordCard
        metrics={flow.metrics}
        isEnglish={isEnglish}
        now={now}
        hasLvefQuestion={flow.questions.some((question) => question.id === 'lvef-phenotype')}
        onRefill={(metric) => {
          if (metric.factKey === 'LVEF') {
            focusVisitFlowTarget({ kind: 'question', questionId: 'lvef-phenotype' })
            return
          }
          openVitalsForm(REFILLABLE_FACT_KEYS.includes(metric.factKey)
            ? undefined
            : (isEnglish
              ? 'This stage takes only blood pressure, heart rate, SpO₂, weight and height.'
              : '本階段僅支援血壓、心率、SpO₂、體重、身高。'))
        }}
        canEdit={Boolean(onSaveClinicVitals)}
        onOpenForm={() => openVitalsForm()}
      />

      <QuestionsCard
        flow={flow}
        isEnglish={isEnglish}
        now={now}
        clinicVitals={clinicVitals}
        onSaveClinicVitals={onSaveClinicVitals}
        onClearClinicVitals={onClearClinicVitals}
        phenotypeAnswer={phenotypeAnswer}
        onAnswerPhenotype={onAnswerPhenotype}
        board={board}
        hfpefReading={hfpefReading}
        onOpenCalculator={onSaveHfpefInputs ? () => setCalculatorOpen(true) : undefined}
        vitalsFormOpen={vitalsFormOpen}
        vitalsScopeNote={vitalsScopeNote}
        onOpenVitalsForm={() => openVitalsForm()}
        onCloseVitalsForm={() => { setVitalsFormOpen(false); setVitalsScopeNote(undefined) }}
      />

      <ActionsCard
        flow={flow}
        isEnglish={isEnglish}
        now={now}
        expandedId={expandedId}
        onToggle={onToggle}
        renderDetail={renderDetail}
        collapsedGroups={collapsedGroups}
        onToggleGroup={(id) => setCollapsedGroups((current) => {
          const next = new Set(current)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })}
        editingDecisions={editingDecisions}
        onEditDecision={(moduleId, editing) => setEditingDecisions((current) => {
          const next = new Set(current)
          if (editing) next.add(moduleId)
          else next.delete(moduleId)
          return next
        })}
        onRecordDecision={onRecordDecision}
        onClearDecision={onClearDecision}
        packVersion={packVersion}
      />

      <FollowUpCard
        flow={flow}
        board={board}
        isEnglish={isEnglish}
        now={now}
      />

      {hfpefReading && onSaveHfpefInputs ? (
        <HfpefInputsDialog
          open={calculatorOpen}
          onOpenChange={setCalculatorOpen}
          reading={hfpefReading}
          isEnglish={isEnglish}
          now={now}
          onApply={onSaveHfpefInputs}
          {...(natriureticRowId(flow)
            ? {
              onOrderNtProBnp: () => focusVisitFlowTarget({
                kind: 'action',
                moduleId: natriureticRowId(flow)!,
                index: 1,
              }),
            }
            : {})}
        />
      ) : null}
    </div>
  )
}

/**
 * The row that would order an NT-proBNP, where the pack raised one.
 *
 * Read off the pack's own 「這項決策還缺」 rather than named here: which module
 * asks for the assay is the pack's to decide, and a hard-coded module id would
 * send the reader to a row that had moved.
 */
function natriureticRowId(flow: VisitFlowModel): string | undefined {
  return flow.actionGroups
    .flatMap((group) => group.rows)
    .find((row) => (
      row.recommendation.missingData?.some((item) => /NT-proBNP|BNP/i.test(item))
      || /NT-proBNP/i.test(row.headline)
    ))?.recommendation.id
}

/* ----------------------------------------------------------- 區塊 1 步驟列 */

function StepIcon({ state }: { state: VisitStep['state'] }) {
  if (state === 'done') {
    return <Check className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
  }
  if (state === 'na') {
    return <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  }
  return (
    <Circle
      className={cn(
        'h-4 w-4 shrink-0',
        state === 'current' ? 'fill-primary/15 text-primary' : 'text-muted-foreground/60',
      )}
      aria-hidden="true"
    />
  )
}

function StepCard({
  steps,
  nextStep,
  isEnglish,
  onGo,
  summaryText,
}: {
  steps: readonly VisitStep[]
  nextStep: VisitFlowModel['nextStep']
  isEnglish: boolean
  onGo: () => void
  summaryText: string
}) {
  const { copied, copy } = useCopyToClipboard()
  const isCopy = nextStep.target.kind === 'copy'
  const stateText: Record<VisitStep['state'], string> = {
    done: isEnglish ? 'done' : '完成',
    current: isEnglish ? 'in progress' : '進行中',
    todo: isEnglish ? 'not started' : '尚未',
    na: isEnglish ? 'not applicable' : '不適用',
  }
  return (
    <section
      className="overflow-hidden rounded-lg border border-border bg-card"
      aria-label={isEnglish ? 'Visit progress' : '看診進度'}
      data-testid="cdss-hf-steps"
    >
      <ol className="grid divide-y divide-border @min-[40rem]:grid-cols-4 @min-[40rem]:divide-x @min-[40rem]:divide-y-0">
        {steps.map((step) => (
          <li
            key={step.id}
            className={cn('flex min-h-11 items-start gap-2 px-3 py-2', step.state === 'current' && 'bg-primary/[0.04]')}
            data-testid={`cdss-hf-step-${step.id}`}
            data-state={step.state}
          >
            <span className="mt-0.5 flex items-center gap-1.5">
              <StepIcon state={step.state} />
              <span className={cn(
                'text-[11px] font-semibold tabular-nums',
                step.state === 'current' ? 'text-primary' : 'text-muted-foreground',
              )}>
                {step.index}
              </span>
            </span>
            <span className="min-w-0">
              <span className={cn(
                'block text-sm font-semibold leading-5',
                step.state === 'todo' || step.state === 'na' ? 'text-muted-foreground' : 'text-foreground',
              )}>
                {step.label}
              </span>
              <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                {step.detail}
              </span>
              <span className="sr-only">{stateText[step.state]}</span>
            </span>
          </li>
        ))}
      </ol>

      <div
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-3 py-2.5',
          nextStep.tone === 'safety'
            ? 'bg-amber-50 dark:bg-amber-500/[0.08]'
            : nextStep.tone === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-500/[0.08]'
              : 'bg-primary/[0.05]',
        )}
        data-testid="cdss-hf-next-step"
        data-tone={nextStep.tone}
      >
        {nextStep.tone === 'safety' ? (
          <TriangleAlert className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
        ) : nextStep.tone === 'ok' ? (
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
        ) : (
          <ArrowRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-5 text-foreground">
            {nextStep.message}
          </span>
          {nextStep.hint ? (
            <span
              className="mt-0.5 block text-[11px] leading-4 text-muted-foreground"
              data-testid="cdss-hf-next-step-hint"
            >
              {nextStep.hint}
            </span>
          ) : null}
        </span>
        <Button
          type="button"
          size="sm"
          className="h-8 shrink-0"
          onClick={() => {
            if (!isCopy) {
              onGo()
              return
            }
            void copy(summaryText).then((ok) => {
              if (!ok) {
                toast.error(isEnglish
                  ? 'Could not copy — the clipboard is unavailable in this context.'
                  : '無法複製，此環境無法使用剪貼簿。')
              }
            })
          }}
          data-testid="cdss-hf-next-step-action"
        >
          {isCopy && copied
            ? (isEnglish ? 'Copied' : '已複製')
            : nextStep.actionLabel}
        </Button>
      </div>
    </section>
  )
}

/* ------------------------------------------------- 區塊 2 系統已從病歷讀到 */

const MISSING_PATTERN_STYLE = { backgroundImage: 'var(--clinical-missing-data-pattern)' } as const

function metricSourceLine(
  metric: HeartFailureMetric,
  isEnglish: boolean,
): string | undefined {
  const day = formatDay(metric.date)
  if (metric.entered) {
    return isEnglish ? `Clinic ${day ?? 'today'} · entered by you` : `門診 ${day ?? '今日'} · 你輸入`
  }
  if (!day) return undefined
  if (metric.factKey === 'LVEF') return isEnglish ? `Echo ${day}` : `心超 ${day}`
  return metric.kind === 'lab' ? (isEnglish ? `Lab ${day}` : `檢驗 ${day}`) : day
}

function RecordCard({
  metrics,
  isEnglish,
  now,
  hasLvefQuestion,
  onRefill,
  canEdit,
  onOpenForm,
}: {
  metrics: readonly HeartFailureMetric[]
  isEnglish: boolean
  now: Date
  hasLvefQuestion: boolean
  onRefill: (metric: HeartFailureMetric) => void
  canEdit: boolean
  onOpenForm: () => void
}) {
  return (
    <section
      className="overflow-hidden rounded-lg border border-border bg-card"
      aria-label={isEnglish ? 'Read from the record' : '系統已從病歷讀到'}
      data-testid="cdss-hf-record-values"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-muted/40 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-indigo-700 dark:text-secondary-foreground/80">
          {isEnglish ? 'Read from the record' : '系統已從病歷讀到'}
        </span>
        <span className="text-sm font-semibold text-foreground">
          {isEnglish ? 'Clinical inputs for the decisions' : '決策所需臨床資訊'}
        </span>
        {canEdit ? (
          <button
            type="button"
            className="ml-auto inline-flex min-h-8 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onOpenForm}
            data-testid="cdss-hf-record-values-edit"
          >
            <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
            {isEnglish ? 'Add or edit clinic measurements' : '補填／修改門診量測'}
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-border/60 @min-[32rem]:grid-cols-4 @min-[60rem]:grid-cols-8">
        {metrics.map((metric) => {
          const missing = metric.value === undefined
          const source = metricSourceLine(metric, isEnglish)
          const refillable = canEdit && (metric.factKey !== 'LVEF' || hasLvefQuestion)
          return (
            <div
              key={metric.factKey}
              className={cn('min-w-0 px-2 py-2', missing && 'bg-muted/40')}
              style={missing ? MISSING_PATTERN_STYLE : undefined}
              title={metric.fullValue}
              data-testid={`cdss-hf-flow-metric-${metric.factKey}`}
              data-missing={missing ? 'true' : undefined}
              data-stale={metric.stale ? 'true' : undefined}
              data-entered={metric.entered ? 'true' : undefined}
            >
              <div className="truncate text-[11px] font-medium leading-4 text-muted-foreground">
                {metric.label}
                {metric.unit ? <span className="ml-1 font-normal opacity-80">{metric.unit}</span> : null}
              </div>
              {missing ? (
                <>
                  <div className="mt-0.5 text-sm font-medium leading-5 text-muted-foreground">
                    {isEnglish ? 'No value in the record' : '紀錄無值'}
                  </div>
                  {refillable ? (
                    <button
                      type="button"
                      className="min-h-7 rounded-md text-[11px] font-medium text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => onRefill(metric)}
                      data-testid={`cdss-hf-flow-metric-refill-${metric.factKey}`}
                    >
                      {isEnglish ? 'Add it' : '補填'}
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <div className={cn(
                    'mt-0.5 truncate text-base font-semibold leading-5 tabular-nums',
                    metric.stale ? 'text-amber-700 dark:text-amber-300' : 'text-foreground',
                  )}>
                    {metric.value}
                  </div>
                  {source ? (
                    <div className={cn(
                      'truncate text-[11px] leading-4 tabular-nums',
                      metric.stale
                        ? 'font-medium text-amber-700 dark:text-amber-300'
                        : metric.entered
                          ? 'font-medium text-primary'
                          : 'text-muted-foreground',
                    )}>
                      {source}
                      {metric.stale && metric.ageDays !== undefined
                        ? ` · ${isEnglish ? `${metric.ageDays}d` : `${metric.ageDays} 天`}`
                        : ''}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          )
        })}
      </div>
      <p className="border-t border-border px-3 py-1.5 text-[11px] leading-4 text-muted-foreground">
        {isEnglish
          ? 'A missing value reads 「no value in the record」 and is never treated as normal. An entered value is encrypted and kept for this tab session, carries its measurement and modification dates, and is not carried to the next visit until phase 2.'
          : '缺的值以「紀錄無值」顯示，不會被當成正常。補填的值加密保存於本分頁的工作階段，並記量測日與修改日；跨次就診沿用為第二階段。'}
        {' '}
        {formatStamp(now.toISOString(), now, isEnglish)}
      </p>
    </section>
  )
}

/* --------------------------------------------------- 區塊 3 需要你判斷 */

function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onSelect,
  testId,
  disabled,
}: {
  label: string
  options: readonly { id: T; text: string }[]
  value: T | null
  onSelect: (next: T) => void
  testId: string
  disabled?: boolean
}) {
  return (
    <div
      className="flex shrink-0 overflow-hidden rounded-md border border-border"
      role="group"
      aria-label={label}
      data-testid={testId}
    >
      {options.map((option) => {
        const isSelected = value === option.id
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={isSelected}
            disabled={disabled}
            className={cn(
              'min-h-8 min-w-[2.5rem] px-2.5 text-xs font-medium transition-colors',
              'border-r border-border last:border-r-0',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              'disabled:cursor-not-allowed disabled:opacity-50',
              isSelected
                ? 'bg-primary/10 text-primary'
                : 'bg-card text-muted-foreground hover:bg-muted/40',
            )}
            onClick={() => onSelect(option.id)}
            data-testid={`${testId}-${option.id}`}
          >
            {option.text}
          </button>
        )
      })}
    </div>
  )
}

/** The one-character side tag in front of a symptom or a sign. */
const SIDE_TAG_CLASS: Readonly<Record<VisitSignSide, string>> = {
  pulmonary: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200',
  systemic: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200',
  both: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200',
}

function SideTag({ side, isEnglish }: { side: VisitSignSide; isEnglish: boolean }) {
  const meta = VISIT_SIDE_LABELS[side]
  return (
    <span
      className={cn(
        'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-semibold leading-none',
        SIDE_TAG_CLASS[side],
      )}
      title={isEnglish ? meta.legendEn : meta.legendZh}
      data-testid={`cdss-hf-side-tag-${side}`}
    >
      {isEnglish ? meta.tagEn : meta.tagZh}
    </span>
  )
}

/** 「肺鬱血 2 · 體循環 2」 beside the folded answer of question ④. */
function SideTallyChip({
  tally,
  isEnglish,
}: {
  tally: { pulmonary: number; systemic: number }
  isEnglish: boolean
}) {
  if (tally.pulmonary === 0 && tally.systemic === 0) return null
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md bg-muted px-1.5 py-px text-[11px] tabular-nums text-muted-foreground"
      data-testid="cdss-hf-side-tally"
      data-pulmonary={tally.pulmonary}
      data-systemic={tally.systemic}
    >
      <span>{isEnglish ? `Pulmonary ${tally.pulmonary}` : `肺鬱血 ${tally.pulmonary}`}</span>
      <span aria-hidden="true">·</span>
      <span>{isEnglish ? `Systemic ${tally.systemic}` : `體循環 ${tally.systemic}`}</span>
    </span>
  )
}

/**
 * One question's rows: a side tag, the finding, and 有／無／未評估.
 *
 * The 常見 rows are open; the rest fold behind 「更多 n 項」, whose folded line
 * names them so the reader knows what is behind it rather than having to open
 * it to find out. Each row writes its own term with its own stamp — a visit
 * where only 腳腫 was asked about says exactly that.
 */
function SignItemRows({
  questionId,
  items,
  clinicVitals,
  isEnglish,
  showLegend,
  onAnswer,
}: {
  questionId: VisitQuestionId
  items: readonly VisitSignItem[]
  clinicVitals?: ClinicVitals
  isEnglish: boolean
  showLegend: boolean
  onAnswer: (term: string, value: SignAnswerValue) => void
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  const common = items.filter((item) => item.common)
  const more = items.filter((item) => !item.common)
  const row = (item: VisitSignItem) => (
    <div key={item.term} className="flex flex-wrap items-center gap-2">
      <SideTag side={item.side} isEnglish={isEnglish} />
      <span className="min-w-0 flex-1 text-xs text-foreground">
        {isEnglish ? item.en : item.zh}
      </span>
      <SegmentedControl<SignAnswerValue>
        label={isEnglish ? item.en : item.zh}
        options={[
          { id: 'present', text: isEnglish ? 'Yes' : '有' },
          { id: 'absent', text: isEnglish ? 'No' : '無' },
          { id: NOT_ASSESSED, text: isEnglish ? 'Not assessed' : '未評估' },
        ]}
        value={clinicVitals?.signAnswers?.[item.term]?.value ?? null}
        onSelect={(next) => onAnswer(item.term, next)}
        testId={`cdss-hf-flow-sign-${item.term}`}
      />
    </div>
  )
  return (
    <div className="space-y-2" data-testid={`cdss-hf-sign-items-${questionId}`}>
      {showLegend ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-4 text-muted-foreground">
          {(['pulmonary', 'systemic', 'both'] as const).map((side) => (
            <span key={side} className="inline-flex items-center gap-1">
              <SideTag side={side} isEnglish={isEnglish} />
              {isEnglish ? VISIT_SIDE_LABELS[side].legendEn : VISIT_SIDE_LABELS[side].legendZh}
            </span>
          ))}
        </p>
      ) : null}
      <div className="grid gap-x-6 gap-y-1.5 @min-[44rem]:grid-cols-2">
        {common.map(row)}
        {moreOpen ? more.map(row) : null}
      </div>
      {more.length > 0 ? (
        <button
          type="button"
          className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-md px-1.5 text-left text-[11px] font-medium text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
          data-testid={`cdss-hf-sign-more-${questionId}`}
        >
          <ChevronDown className={cn('h-3 w-3 shrink-0 transition-transform', moreOpen && 'rotate-180')} aria-hidden="true" />
          {isEnglish ? `${more.length} more` : `更多 ${more.length} 項`}
          {moreOpen ? null : (
            <span className="min-w-0 truncate font-normal text-muted-foreground">
              {more
                .map((item) => `${isEnglish ? item.shortEn : item.shortZh}（${isEnglish ? VISIT_SIDE_LABELS[item.side].tagEn : VISIT_SIDE_LABELS[item.side].tagZh}）`)
                .join(' · ')}
            </span>
          )}
        </button>
      ) : null}
    </div>
  )
}

/**
 * Question ⑦: the HFpEF conclusion, with the three criteria beside it.
 *
 * Which button leads depends on what is missing. While criterion (i) is
 * undetermined the useful action is not 「確認」 but 「去答第 2 題」, because the
 * symptoms are what would settle it; a screen that led with the confirmation
 * invited a conclusion drawn over an unread criterion. 「暫不確認」 is the third
 * state and the reason this question can be finished at all: it says the
 * question was put and no diagnosis was made today, and it writes no fact —
 * 「先不確認」 is not a statement that the patient has no HFpEF.
 */
/**
 * The two scores, as the host's own calculator computed them.
 *
 * Printed from the calculator rather than waited for from the pack, because
 * the calculator is the only thing that scores: the pack reads the same
 * numbers off the facts this host wrote. A score with parameters missing is
 * never printed as a bare total — what is still unreported, and how much it
 * could still add, is on the line under it.
 */
function HfpEfScoreLine({
  reading,
  isEnglish,
  onComplete,
}: {
  reading?: HfpefReading
  isEnglish: boolean
  onComplete?: () => void
}) {
  const scores = [reading?.hfaPeff, reading?.h2fpef]
    .filter((score): score is HfpefScoreReading => Boolean(score))
  const date = scores.map((score) => score.date).filter(Boolean).sort().at(-1)
  const missing = scores.find((score) => score.missing.length > 0)
  return (
    <div
      className="rounded-md border border-border bg-muted/[0.12] px-2.5 py-2"
      data-testid="cdss-hf-hfpef-scores"
    >
      {scores.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {isEnglish
            ? 'The calculator has no score yet: the record does not carry enough of the parameters.'
            : '目前的輸入不足，計算機尚無分數。'}
        </p>
      ) : (
        <>
          {scores.map((score) => (
            <p
              key={score.id}
              className="flex flex-wrap items-baseline gap-x-2 text-xs"
              data-testid={`cdss-hf-hfpef-score-${score.id}`}
            >
              <span className="w-[5.5rem] shrink-0 font-semibold text-foreground">{score.name}</span>
              <span className="font-semibold tabular-nums text-foreground">
                {score.score}
                {isEnglish ? '/' : '／'}
                {score.maximum}
              </span>
              <span className="text-muted-foreground">
                {isEnglish ? score.bandEn : score.bandZh}
              </span>
            </p>
          ))}
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
            {isEnglish
              ? `By calculator ${HFPEF_CALCULATOR_VERSION}${date ? ` · echo ${date}` : ''}`
              : `依計算機 ${HFPEF_CALCULATOR_VERSION}${date ? ` · 心超 ${date}` : ''}`}
          </p>
          {missing ? (
            <p
              className="mt-0.5 text-[11px] leading-4 text-amber-800 dark:text-amber-300"
              data-testid="cdss-hf-hfpef-score-missing"
            >
              {isEnglish
                ? `Not reported: ${missing.missingEn.join(', ')} (at most +${missing.upper - missing.score})`
                : `報告未提供：${missing.missingZh.join('、')}（最多再 +${missing.upper - missing.score}）`}
            </p>
          ) : null}
        </>
      )}
      {onComplete ? (
        <button
          type="button"
          className="mt-1 inline-flex min-h-8 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onComplete}
          data-testid="cdss-hf-hfpef-open-calculator"
        >
          <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
          {isEnglish ? 'Complete the echo values' : '補完心超數值'}
        </button>
      ) : null}
    </div>
  )
}

function HfpEfConfirmation({
  summary,
  isEnglish,
  now,
  answer,
  onAnswer,
  hfpefReading,
  onOpenCalculator,
}: {
  summary: DiagnosticSummary | undefined
  isEnglish: boolean
  now: Date
  answer?: PhenotypeAnswer
  onAnswer: (answer: PhenotypeAnswer) => void
  hfpefReading?: HfpefReading
  onOpenCalculator?: () => void
}) {
  const symptomsState = summary?.criteria
    .find((criterion) => criterion.id === 'symptoms-signs')?.state
  const symptomsUndetermined = symptomsState === 'undetermined'
  const record = (value: true | typeof HFPEF_NOT_CONFIRMED) => onAnswer({
    ...(answer ?? {}),
    answeredOn: todayIsoDate(now),
    hfpEfConfirmed: value,
  })
  return (
    <div className="space-y-2" data-testid="cdss-hf-hfpef-confirmation">
      <DiagnosisReading summary={summary} isEnglish={isEnglish} showScores={false} />
      <HfpEfScoreLine
        reading={hfpefReading}
        isEnglish={isEnglish}
        {...(onOpenCalculator ? { onComplete: onOpenCalculator } : {})}
      />
      <div className="flex flex-wrap items-center gap-2">
        {symptomsUndetermined ? (
          <Button
            type="button"
            size="sm"
            className="h-8"
            onClick={() => focusVisitFlowTarget({ kind: 'question', questionId: 'symptoms' })}
            data-testid="cdss-hf-hfpef-go-to-symptoms"
          >
            {isEnglish ? 'Go to question 2' : '前往第 2 題'}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant={symptomsUndetermined ? 'outline' : 'default'}
          className="h-8"
          onClick={() => record(true)}
          data-testid="cdss-hf-hfpef-confirm"
        >
          {isEnglish ? 'Confirm the HFpEF diagnosis' : '確認 HFpEF 診斷'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8"
          onClick={() => record(HFPEF_NOT_CONFIRMED)}
          data-testid="cdss-hf-hfpef-defer"
        >
          {isEnglish ? 'Not confirming today' : '暫不確認'}
        </Button>
      </div>
      <p className="text-[11px] leading-4 text-muted-foreground">
        {isEnglish
          ? 'Encrypted and kept for this tab session only; carrying it to the next visit is phase 2, and nothing is written to the chart or to any claim. The HFpEF treatment recommendations appear under today’s actions once it is confirmed.'
          : '加密保存於本分頁的工作階段，跨次就診沿用為第二階段；不寫回病歷，也不做健保申報。確認後 HFpEF 治療建議才會出現在今日處置。'}
      </p>
    </div>
  )
}

function QuestionShell({
  question,
  isEnglish,
  now,
  onEdit,
  answerBadge,
  children,
}: {
  question: VisitQuestion
  isEnglish: boolean
  now: Date
  onEdit?: () => void
  /** Shown beside the folded answer — the side tally on question ④. */
  answerBadge?: ReactNode
  children?: ReactNode
}) {
  const stamp = formatStamp(question.modifiedAt, now, isEnglish)
  const open = question.state === 'open'
  const answered = question.state === 'answered'
  return (
    <li
      id={visitQuestionElementId(question.id)}
      className={cn(
        'flex min-h-11 gap-2.5 px-3 py-2.5',
        open && 'bg-primary/[0.04]',
      )}
      data-testid={`cdss-hf-question-${question.id}`}
      data-state={question.state}
      data-number={question.number}
    >
      <span
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums',
          open
            ? 'bg-primary/10 text-primary'
            : answered
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200'
              : 'border border-dashed border-border text-muted-foreground',
        )}
      >
        {answered ? <Check className="h-3 w-3" aria-hidden="true" /> : question.number}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={cn(
            'text-sm font-semibold leading-5',
            question.state === 'locked' ? 'text-muted-foreground' : 'text-foreground',
          )}>
            {question.label}
          </span>
          {answered && question.answerText ? (
            <span
              className="text-xs font-medium text-foreground"
              data-testid={`cdss-hf-question-answer-${question.id}`}
            >
              {question.answerText}
            </span>
          ) : null}
          {answered && answerBadge ? answerBadge : null}
          {answered && stamp ? (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {isEnglish ? `last changed ${stamp}` : `最後修改 ${stamp}`}
            </span>
          ) : null}
          {answered && onEdit ? (
            <button
              type="button"
              className="ml-auto min-h-7 rounded-md px-1.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={onEdit}
              data-testid={`cdss-hf-question-edit-${question.id}`}
            >
              {isEnglish ? 'Change' : '改'}
            </button>
          ) : null}
        </div>
        {question.state === 'locked' ? (
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
            {question.lockedReason}
          </p>
        ) : (
          <>
            {question.hint ? (
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{question.hint}</p>
            ) : null}
            {children ? <div className="mt-2">{children}</div> : null}
          </>
        )}
      </div>
    </li>
  )
}

function QuestionsCard({
  flow,
  isEnglish,
  now,
  clinicVitals,
  onSaveClinicVitals,
  onClearClinicVitals,
  phenotypeAnswer,
  onAnswerPhenotype,
  board,
  hfpefReading,
  onOpenCalculator,
  vitalsFormOpen,
  vitalsScopeNote,
  onOpenVitalsForm,
  onCloseVitalsForm,
}: {
  flow: VisitFlowModel
  isEnglish: boolean
  now: Date
  clinicVitals?: ClinicVitals
  onSaveClinicVitals?: (patch: ClinicVitalsPatch) => void
  onClearClinicVitals?: () => void
  phenotypeAnswer?: PhenotypeAnswer
  onAnswerPhenotype?: (answer: PhenotypeAnswer) => void
  board: HeartFailureBoardModel
  hfpefReading?: HfpefReading
  onOpenCalculator?: () => void
  vitalsFormOpen: boolean
  vitalsScopeNote?: string
  onOpenVitalsForm: () => void
  onCloseVitalsForm: () => void
}) {
  // A question a clinician answered can be reopened; the row is otherwise one
  // line, which is the point — the same question is not asked twice.
  const [reopened, setReopened] = useState<ReadonlySet<VisitQuestionId>>(new Set())
  const reopen = (id: VisitQuestionId) => setReopened((current) => new Set(current).add(id))
  const shows = (question: VisitQuestion) => (
    question.state === 'open' || reopened.has(question.id)
  )
  const diagnosisCard = board.hfpEfDiagnosis

  return (
    <section
      className="overflow-hidden rounded-lg border border-border bg-card"
      aria-label={isEnglish ? "This visit's assessment" : '本次評估'}
      data-testid="cdss-hf-questions"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-muted/40 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-violet-700 dark:text-secondary-foreground/80">
          {isEnglish ? 'Your judgement' : '需要你判斷'}
        </span>
        <span className="text-sm font-semibold text-foreground">
          {isEnglish ? "This visit's assessment" : '本次評估'}
        </span>
        <span
          className="ml-auto text-[11px] tabular-nums text-muted-foreground"
          data-testid="cdss-hf-questions-remaining"
        >
          {flow.openQuestionCount > 0
            ? (isEnglish ? `${flow.openQuestionCount} left` : `還有 ${flow.openQuestionCount} 題`)
            : (isEnglish ? 'Assessment complete' : '本次評估完成')}
        </span>
      </div>
      <p className="border-b border-border px-3 py-1.5 text-[11px] leading-4 text-muted-foreground">
        {isEnglish
          ? 'Each question is asked here and nowhere else; 「not assessed」 is the default and is never read as a negative. Symptoms are what the patient says, signs are what you find — they are recorded apart. Answers re-enter the rules, and the actions below recompute.'
          : '每題只在這裡問一次；預設「未評估」，不會被當成陰性。症狀是病人說的，徵象是你檢查的，分開記。答案寫回規則後，下方處置會重算。'}
      </p>
      {flow.questions.some((question) => question.id === 'hfpef-confirmation') ? (
        <p
          className="border-b border-border px-3 py-1.5 text-[11px] leading-4 text-muted-foreground"
          data-testid="cdss-hf-questions-hfpef-note"
        >
          {isEnglish
            ? 'A patient with an LVEF of 50% or more gets one more question at the end of this assessment. It reads the answers to questions 2 and 4 to judge criterion (i), which is why it comes last.'
            : 'LVEF ≥50% 的病人在本次評估最後多一題。它讀第 2、4 題的答案判條件 (i)，所以排在後面。'}
        </p>
      ) : null}
      {flow.readOnly ? (
        <p
          className="px-3 py-2 text-xs text-muted-foreground"
          data-testid="cdss-hf-questions-read-only"
        >
          {isEnglish ? 'Load a patient record to answer.' : '需載入病人才能作答。'}
        </p>
      ) : null}
      <ul className="divide-y divide-border">
        {flow.questions.map((question) => {
          const editable = !flow.readOnly
          const onEdit = editable ? () => reopen(question.id) : undefined

          if (question.id === 'hf-suspicion' || question.id === 'lvef-phenotype') {
            return (
              <QuestionShell
                key={question.id}
                question={question}
                isEnglish={isEnglish}
                now={now}
                onEdit={onEdit}
              >
                {shows(question) && question.request && onAnswerPhenotype && question.recommendationId ? (
                  <PhysicianInputRequestPanel
                    requests={[question.request]}
                    recommendationId={question.recommendationId}
                    isEnglish={isEnglish}
                    answer={phenotypeAnswer}
                    onAnswer={onAnswerPhenotype}
                    now={now}
                  />
                ) : null}
              </QuestionShell>
            )
          }

          if (question.id === 'hfpef-confirmation') {
            return (
              <QuestionShell
                key={question.id}
                question={question}
                isEnglish={isEnglish}
                now={now}
                onEdit={onEdit}
              >
                {shows(question) && onAnswerPhenotype ? (
                  <HfpEfConfirmation
                    summary={diagnosisCard ? diagnosticSummaryOf(diagnosisCard) : undefined}
                    isEnglish={isEnglish}
                    now={now}
                    answer={phenotypeAnswer}
                    onAnswer={onAnswerPhenotype}
                    hfpefReading={hfpefReading}
                    onOpenCalculator={onOpenCalculator}
                  />
                ) : null}
              </QuestionShell>
            )
          }

          if (question.id === 'nyha') {
            const value = clinicVitals?.nyhaClass?.value ?? null
            return (
              <QuestionShell
                key={question.id}
                question={question}
                isEnglish={isEnglish}
                now={now}
                onEdit={onEdit}
              >
                {shows(question) && onSaveClinicVitals ? (
                  <SegmentedControl<NyhaAnswerValue>
                    label={question.label}
                    options={[
                      { id: 'I', text: 'I' },
                      { id: 'II', text: 'II' },
                      { id: 'III', text: 'III' },
                      { id: 'IV', text: 'IV' },
                      { id: NOT_ASSESSED, text: isEnglish ? 'Not assessed' : '未評估' },
                    ]}
                    value={value}
                    onSelect={(next) => onSaveClinicVitals({ nyhaClass: next })}
                    testId="cdss-hf-flow-nyha"
                  />
                ) : null}
              </QuestionShell>
            )
          }

          if (question.items) {
            return (
              <QuestionShell
                key={question.id}
                question={question}
                isEnglish={isEnglish}
                now={now}
                onEdit={onEdit}
                answerBadge={question.sideTally ? (
                  <SideTallyChip tally={question.sideTally} isEnglish={isEnglish} />
                ) : undefined}
              >
                {shows(question) && onSaveClinicVitals ? (
                  <SignItemRows
                    questionId={question.id}
                    items={question.items}
                    clinicVitals={clinicVitals}
                    isEnglish={isEnglish}
                    showLegend={question.id === 'symptoms'}
                    onAnswer={(term, next) => onSaveClinicVitals({ signAnswers: { [term]: next } })}
                  />
                ) : null}
              </QuestionShell>
            )
          }

          if (question.id === 'compensation') {
            return (
              <QuestionShell
                key={question.id}
                question={question}
                isEnglish={isEnglish}
                now={now}
                onEdit={onEdit}
              >
                {shows(question) && onSaveClinicVitals ? (
                  <SegmentedControl<CompensationAnswerValue>
                    label={question.label}
                    options={[
                      { id: 'compensated', text: isEnglish ? 'Compensated' : '代償' },
                      { id: 'decompensated', text: isEnglish ? 'Decompensated' : '失代償' },
                      { id: NOT_ASSESSED, text: isEnglish ? 'Not assessed' : '未評估' },
                    ]}
                    value={clinicVitals?.compensationStatus?.value ?? null}
                    onSelect={(next) => onSaveClinicVitals({ compensationStatus: next })}
                    testId="cdss-hf-flow-compensation"
                  />
                ) : null}
              </QuestionShell>
            )
          }

          // The clinic measurements: the form itself, opened from here or from
          // a 「補填」 on a missing value above.
          return (
            <QuestionShell
              key={question.id}
              question={question}
              isEnglish={isEnglish}
              now={now}
              onEdit={onSaveClinicVitals ? onOpenVitalsForm : undefined}
            >
              {onSaveClinicVitals ? (
                vitalsFormOpen ? (
                  <ClinicVitalsForm
                    isEnglish={isEnglish}
                    now={now}
                    initial={clinicVitals}
                    onSave={onSaveClinicVitals}
                    onClear={onClearClinicVitals}
                    onClose={onCloseVitalsForm}
                    footnote={vitalsScopeNote}
                  />
                ) : (
                  <button
                    type="button"
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={onOpenVitalsForm}
                    data-testid="cdss-hf-flow-open-vitals"
                  >
                    <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
                    {question.answerText
                      ? (isEnglish ? 'Edit clinic measurements' : '修改門診量測')
                      : (isEnglish ? 'Enter clinic measurements' : '輸入門診量測')}
                  </button>
                )
              ) : null}
            </QuestionShell>
          )
        })}
      </ul>
    </section>
  )
}

/* --------------------------------------------------- 區塊 4 今日處置 */

function ActionsCard({
  flow,
  isEnglish,
  now,
  expandedId,
  onToggle,
  renderDetail,
  collapsedGroups,
  onToggleGroup,
  editingDecisions,
  onEditDecision,
  onRecordDecision,
  onClearDecision,
  packVersion,
}: {
  flow: VisitFlowModel
  isEnglish: boolean
  now: Date
  expandedId: string | null
  onToggle: (id: string) => void
  renderDetail: (recommendation: CdssRecommendation) => ReactNode
  collapsedGroups: ReadonlySet<VisitActionGroupId>
  onToggleGroup: (id: VisitActionGroupId) => void
  editingDecisions: ReadonlySet<string>
  onEditDecision: (moduleId: string, editing: boolean) => void
  onRecordDecision?: (moduleId: string, input: PhysicianDecisionInput) => void
  onClearDecision?: (moduleId: string) => void
  packVersion: string
}) {
  return (
    <section
      className="overflow-hidden rounded-lg border border-border bg-card"
      aria-label={isEnglish ? "Today's actions" : '今日處置'}
      data-testid="cdss-hf-actions"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-muted/40 px-3 py-1.5">
        <ListChecks className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="text-[11px] font-semibold text-indigo-700 dark:text-secondary-foreground/80">
          {isEnglish ? 'Recommendations and your decisions' : '建議與你的決定'}
        </span>
        <span className="text-sm font-semibold text-foreground">
          {isEnglish ? "Today's actions" : '今日處置'}
        </span>
        <span
          className="ml-auto text-[11px] tabular-nums text-muted-foreground"
          data-testid="cdss-hf-actions-decided"
        >
          {isEnglish
            ? `${flow.decidedCount} / ${flow.decidableCount} decided`
            : `已決定 ${flow.decidedCount} / ${flow.decidableCount}`}
        </span>
      </div>
      <p className="border-b border-border px-3 py-1.5 text-[11px] leading-4 text-muted-foreground">
        {isEnglish
          ? "Ordered by the rules' own priority. A decision is your record only: nothing is written to the chart or claimed, and 「prescribed」 does not close the row — if the rules find the same gap next visit it comes back, carrying today's decision."
          : '排序＝規則的優先順序。處置只是你的紀錄，不寫回病歷、不申報；「已開立」不會永久關閉這一列，下次規則若再發現缺口會重新出現，並帶著這次的決定。'}
      </p>

      {flow.actionGroups.length === 0 ? (
        <p className="px-3 py-2.5 text-xs text-muted-foreground" data-testid="cdss-hf-actions-empty">
          {isEnglish ? 'Nothing to decide this visit.' : '本次無需處理。'}
        </p>
      ) : null}

      {flow.actionGroups.map((group) => {
        const collapsed = collapsedGroups.has(group.id)
        const tone = GROUP_PRESENTATION[group.id]
        return (
          <div key={group.id} data-testid={`cdss-hf-action-group-${group.id}`}>
            <button
              type="button"
              className="flex h-7 w-full items-center gap-2 px-3 text-left transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              aria-expanded={!collapsed}
              onClick={() => onToggleGroup(group.id)}
              data-testid={`cdss-hf-action-group-trigger-${group.id}`}
            >
              <span className={cn('flex min-w-0 shrink items-center gap-1.5', tone.toneClass)}>
                <span className="text-[11px] font-semibold leading-none">{group.label}</span>
                <span className="text-[10px] leading-none opacity-75">· {group.rows.length}</span>
                {collapsed && group.summary ? (
                  <span
                    className="min-w-0 truncate text-[11px] font-normal leading-none text-muted-foreground"
                    title={group.summary}
                    data-testid={`cdss-hf-action-group-summary-${group.id}`}
                  >
                    {group.summary}
                  </span>
                ) : null}
                <ChevronDown
                  className={cn('h-3 w-3 opacity-75 transition-transform', !collapsed && 'rotate-180')}
                  aria-hidden="true"
                />
              </span>
              <span className={cn('h-px min-w-4 flex-1', tone.dividerClass)} aria-hidden="true" />
            </button>

            {collapsed ? null : group.rows.map((row) => {
              const moduleId = row.recommendation.id
              const expanded = expandedId === moduleId
              return (
                <article
                  key={moduleId}
                  id={visitActionElementId(moduleId)}
                  className="border-b border-border last:border-b-0"
                  data-testid={`cdss-hf-action-row-${moduleId}`}
                  data-decided={row.decision ? 'true' : undefined}
                >
                  <div className="flex">
                    <span
                      className={cn('w-[3px] shrink-0', ROW_BAR_CLASS[group.id])}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1 px-3 py-2.5">
                      <div className="flex min-w-0 items-start gap-2">
                        {row.index !== undefined ? (
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground">
                            {row.index}
                          </span>
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                            <Badge className={cn('h-5 shrink-0 px-1.5 text-[11px]', statusStyle[row.status])}>
                              <StatusIcon status={row.status} />
                              {row.isSafety
                                ? (isEnglish ? 'Safety alert' : '安全警訊')
                                : statusLabel(row.status, isEnglish)}
                            </Badge>
                            <span
                              className="min-w-0 text-sm font-semibold leading-snug text-foreground"
                              data-testid={`cdss-hf-action-headline-${moduleId}`}
                            >
                              {row.headline}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                            <span className="font-medium text-foreground">{row.moduleName}</span>
                          </p>
                          {row.medications ? (
                            <p
                              className="mt-0.5 text-xs leading-relaxed text-muted-foreground"
                              data-testid={`cdss-hf-action-medications-${moduleId}`}
                            >
                              <span className="font-medium text-foreground">
                                {isEnglish ? 'Currently taking' : '目前用藥'}：
                              </span>
                              {row.medications}
                            </p>
                          ) : null}
                          {row.basis ? (
                            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                              <span className="font-medium text-foreground">
                                {isEnglish ? 'Basis' : '依據'}：
                              </span>
                              {row.basis}
                            </p>
                          ) : null}
                          <DecisionControls
                            key={`${moduleId}-${row.decision?.recordedAt ?? 'none'}`}
                            row={row}
                            isEnglish={isEnglish}
                            now={now}
                            editing={editingDecisions.has(moduleId)}
                            onEdit={(editing) => onEditDecision(moduleId, editing)}
                            onRecordDecision={onRecordDecision}
                            onClearDecision={onClearDecision}
                            packVersion={packVersion}
                            readOnly={flow.readOnly}
                          />
                        </div>
                        <button
                          type="button"
                          className="flex min-h-8 shrink-0 items-center rounded-md px-1 text-primary transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-expanded={expanded}
                          aria-label={isEnglish ? 'Show decision details' : '展開決策詳情'}
                          onClick={() => onToggle(moduleId)}
                          data-testid={`cdss-hf-action-expand-${moduleId}`}
                        >
                          <ChevronDown
                            className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')}
                            aria-hidden="true"
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                  {expanded ? (
                    <div
                      role="region"
                      className="border-t border-border bg-background"
                      data-testid={`cdss-hf-action-detail-${moduleId}`}
                    >
                      {renderDetail(row.recommendation)}
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        )
      })}
    </section>
  )
}

/* ------------------------------------------------- 區塊 5 紀錄與追蹤 */

function FollowUpCard({
  flow,
  board,
  isEnglish,
  now,
}: {
  flow: VisitFlowModel
  board: HeartFailureBoardModel
  isEnglish: boolean
  now: Date
}) {
  const { copied, copy } = useCopyToClipboard()
  return (
    <section
      className="overflow-hidden rounded-lg border border-border bg-card"
      aria-label={isEnglish ? 'Record and follow-up' : '紀錄與追蹤'}
      data-testid="cdss-hf-follow-up"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-muted/40 px-3 py-1.5">
        <ClipboardList className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="text-[11px] font-semibold text-teal-700 dark:text-secondary-foreground/80">
          {isEnglish ? 'Record and follow-up' : '紀錄與追蹤'}
        </span>
        <span className="text-sm font-semibold text-foreground">
          {isEnglish ? "This visit's summary and what was carried in" : '本次摘要與過往紀錄'}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto h-8"
          onClick={() => {
            void copy(flow.summaryText).then((ok) => {
              if (!ok) {
                toast.error(isEnglish
                  ? 'Could not copy — the clipboard is unavailable in this context.'
                  : '無法複製，此環境無法使用剪貼簿。')
              }
            })
          }}
          data-testid="cdss-hf-copy-summary"
        >
          {copied ? <Check className="mr-1.5 h-4 w-4" aria-hidden="true" /> : <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />}
          <span aria-live="polite">
            {copied
              ? (isEnglish ? 'Copied' : '已複製')
              : (isEnglish ? "Copy this visit's summary" : '複製本次摘要')}
          </span>
        </Button>
      </div>

      {flow.handoff ? (
        <div className="px-3 py-2.5">
          <ClinicalHandoffCard handoff={flow.handoff} />
        </div>
      ) : null}

      <pre
        className="whitespace-pre-wrap break-words px-3 py-2.5 font-sans text-xs leading-relaxed text-foreground"
        data-testid="cdss-hf-summary-text"
      >
        {flow.summaryText}
      </pre>

      {flow.carriedFields.length > 0 ? (
        <div className="border-t border-border px-3 py-2">
          <h4 className="text-[11px] font-semibold text-foreground">
            {isEnglish
              ? 'Answers carried in, with each field’s own date'
              : '上次就診帶入的答案（逐欄位日期）'}
          </h4>
          <table className="mt-1 w-full table-fixed text-[11px]">
            <thead className="sr-only">
              <tr>
                <th>{isEnglish ? 'Field' : '欄位'}</th>
                <th>{isEnglish ? 'Value' : '值'}</th>
                <th>{isEnglish ? 'Date' : '日期'}</th>
              </tr>
            </thead>
            <tbody data-testid="cdss-hf-carried-fields">
              {flow.carriedFields.map((field) => (
                <tr key={`${field.label}-${field.value}`} className="align-top">
                  <td className="w-[9rem] py-0.5 pr-2 text-muted-foreground">{field.label}</td>
                  <td className="py-0.5 pr-2 text-foreground">{field.value}</td>
                  <td className="w-[9rem] py-0.5 tabular-nums text-muted-foreground">{field.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        <span data-testid="cdss-hf-storage-note">
          {isEnglish
            ? `Encrypted for this tab session ${formatStamp(now.toISOString(), now, isEnglish) ?? ''} · carrying answers across visits is phase 2`
            : `本分頁工作階段已加密保存 ${formatStamp(now.toISOString(), now, isEnglish) ?? ''} · 跨次就診沿用（第二階段）`}
        </span>
      </div>

      {board.timeline ? (
        <div className="border-t border-border px-3 py-2">
          <CareTimeline timeline={board.timeline} isEnglish={isEnglish} />
        </div>
      ) : null}
    </section>
  )
}
