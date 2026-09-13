"use client"

import { Fragment, type ReactNode, useState } from 'react'
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
import type {
  PhysicianDecisionInput,
} from '../stores/physician-decisions.store'
import { ClinicalHandoffCard } from '../renderers/ClinicalHandoffCard'
import { statusLabel, statusStyle, StatusIcon } from '../renderers/status-presentation'
import { formatDay, formatStamp } from './build-visit-flow'
import { CoverageLine } from './CoverageLine'
import { DecisionControls } from './controls/DecisionControls'
import type {
  VisitActionGroup,
  VisitActionGroupId,
  VisitActionRow,
  VisitFlowDiseaseConfig,
  VisitFlowMetric,
  VisitFlowModel,
  VisitFlowSurface,
  VisitNextStepTarget,
  VisitQuestion,
  VisitQuestionId,
  VisitStep,
} from './types'

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

/**
 * The tiles 系統已從病歷讀到 shows, in the order the config reads them.
 *
 * The board carries what a module printed; a value the clinician can still
 * complete — an LVEF no module named, a height nobody measured — is added by
 * the config so the editor can offer it. Shared with the editor itself, which
 * must offer exactly the tiles the card drew.
 */
export function visitRecordMetrics(
  flowMetrics: readonly VisitFlowMetric[],
  config: VisitFlowDiseaseConfig,
  surface: VisitFlowSurface,
): VisitFlowMetric[] {
  const metrics = [...flowMetrics]
  for (const extra of config.recordCard.extraMetrics?.(surface) ?? []) {
    if (metrics.some((metric) => metric.factKey === extra.factKey)) continue
    if (extra.factKey === config.recordCard.headlineFactKey) metrics.unshift(extra)
    else metrics.push(extra)
  }
  const order = config.recordCard.order
  metrics.sort((a, b) => order.indexOf(a.factKey) - order.indexOf(b.factKey))
  return metrics
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

export interface VisitFlowProps {
  flow: VisitFlowModel
  config: VisitFlowDiseaseConfig
  isEnglish: boolean
  now: Date
  /** Which recommendation's detail is open, shared with the module list's state. */
  expandedId: string | null
  onToggle: (id: string) => void
  /** The same decision detail every other surface opens. */
  renderDetail: (recommendation: CdssRecommendation) => ReactNode
  onRecordDecision?: (moduleId: string, input: PhysicianDecisionInput) => void
  onClearDecision?: (moduleId: string) => void
  packVersion: string
  /** The stores and callbacks the config's own controls write through. */
  surface: VisitFlowSurface
  /** Opens 補填／修改臨床數值; absent while no patient is loaded. */
  onOpenRecordEditor?: () => void
  /** Drawn beside the large tile: heart failure's rhythm panel. */
  headlineExtra?: ReactNode
  /** A second row under the tiles: the lipid-lowering drug tiles. */
  recordSecondRow?: ReactNode
  /** A note above the questions: heart failure's HFpEF note, the lipid reading. */
  questionsNote?: ReactNode
  /** Drawn at the bottom of 紀錄與追蹤: heart failure's care timeline. */
  followUpExtra?: ReactNode
  /** Dialogs the disease owns, rendered alongside the five cards. */
  children?: ReactNode
}

/**
 * One visit, in five cards, for whichever disease the config describes.
 *
 * The cards know nothing about any disease: a question draws whatever control
 * its spec renders, a row offers whatever decisions its rule allows, and every
 * sentence on screen is either the pack's or the config's. What is here is the
 * layout the heart-failure flow established and dyslipidemia reuses.
 */
export function VisitFlow({
  flow,
  config,
  isEnglish,
  now,
  expandedId,
  onToggle,
  renderDetail,
  onRecordDecision,
  onClearDecision,
  packVersion,
  surface,
  onOpenRecordEditor,
  headlineExtra,
  recordSecondRow,
  questionsNote,
  followUpExtra,
  children,
}: VisitFlowProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<VisitActionGroupId>>(
    () => new Set(flow.actionGroups
      .filter((group) => group.collapsedByDefault)
      .map((group) => group.id)),
  )
  const [editingDecisions, setEditingDecisions] = useState<ReadonlySet<string>>(new Set())
  const prefix = config.testIdPrefix

  return (
    <div className="space-y-3" data-testid={`${prefix}-visit-flow`}>
      {children}
      <StepCard
        steps={flow.steps}
        nextStep={flow.nextStep}
        isEnglish={isEnglish}
        prefix={prefix}
        onGo={() => {
          if (flow.nextStep.target.kind === 'copy') return
          focusVisitFlowTarget(flow.nextStep.target)
        }}
        summaryText={flow.englishSummaryText}
      />

      <RecordCard
        config={config}
        metrics={visitRecordMetrics(flow.metrics, config, surface)}
        isEnglish={isEnglish}
        headlineExtra={headlineExtra}
        secondRow={recordSecondRow}
        onOpenForm={onOpenRecordEditor}
      />

      <QuestionsCard
        flow={flow}
        config={config}
        isEnglish={isEnglish}
        now={now}
        surface={surface}
        note={questionsNote}
      />

      <ActionsCard
        flow={flow}
        config={config}
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
        prefix={prefix}
        isEnglish={isEnglish}
        now={now}
        extra={followUpExtra}
      />
    </div>
  )
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
  prefix,
  onGo,
  summaryText,
}: {
  steps: readonly VisitStep[]
  nextStep: VisitFlowModel['nextStep']
  isEnglish: boolean
  prefix: string
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
      data-testid={`${prefix}-steps`}
    >
      <ol className="grid divide-y divide-border @min-[40rem]:grid-cols-4 @min-[40rem]:divide-x @min-[40rem]:divide-y-0">
        {steps.map((step) => (
          <li
            key={step.id}
            className={cn('flex min-h-11 items-start gap-2 px-3 py-2', step.state === 'current' && 'bg-primary/[0.04]')}
            data-testid={`${prefix}-step-${step.id}`}
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
        data-testid={`${prefix}-next-step`}
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
              data-testid={`${prefix}-next-step-hint`}
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
          data-testid={`${prefix}-next-step-action`}
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

function RecordCard({
  config,
  metrics,
  isEnglish,
  headlineExtra,
  secondRow,
  onOpenForm,
}: {
  config: VisitFlowDiseaseConfig
  metrics: readonly VisitFlowMetric[]
  isEnglish: boolean
  headlineExtra?: ReactNode
  secondRow?: ReactNode
  onOpenForm?: () => void
}) {
  const prefix = config.testIdPrefix
  const card = config.recordCard
  return (
    <section
      className="overflow-hidden rounded-lg border border-border bg-card"
      aria-label={isEnglish ? 'Read from the record' : '系統已從病歷讀到'}
      data-testid={`${prefix}-record-values`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-muted/40 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-indigo-700 dark:text-secondary-foreground/80">
          {isEnglish ? 'Read from the record' : '系統已從病歷讀到'}
        </span>
        <span className="text-sm font-semibold text-foreground">
          {isEnglish ? 'Clinical inputs for the decisions' : '決策所需臨床資訊'}
        </span>
        {onOpenForm ? (
          <button
            type="button"
            className="ml-auto inline-flex min-h-8 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onOpenForm}
            data-testid={`${prefix}-record-values-edit`}
          >
            <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
            {isEnglish ? 'Edit clinical values' : '補填／修改臨床數值'}
          </button>
        ) : null}
      </div>
      <div className={card.columnsClass ?? 'grid grid-cols-2 @min-[24rem]:grid-cols-3 @min-[32rem]:grid-cols-5 @min-[40rem]:grid-cols-[11rem_repeat(5,minmax(0,1fr))]'}>
        {metrics.map((metric) => {
          const isHeadline = metric.factKey === card.headlineFactKey
          const derived = card.deriveTile?.(metric, metrics, isEnglish)
          const displayedValue = derived ? derived.value : metric.value
          const missing = displayedValue === undefined
          const source = derived ? derived.source : formatDay(metric.date)
          const extra = card.renderTileExtra?.(metric, isEnglish)
          return (
            <div
              key={metric.factKey}
              className={cn(
                'min-w-0 border-b border-r border-border/60 px-3 py-2',
                isHeadline && 'relative col-span-full grid grid-cols-1 p-0 @min-[24rem]:grid-cols-2 @min-[40rem]:col-span-1 @min-[40rem]:row-span-2 @min-[40rem]:grid-cols-1 @min-[40rem]:grid-rows-subgrid',
                metric.factKey === 'bloodPressure' && 'col-start-1 @min-[40rem]:col-start-auto',
                missing && 'bg-muted/40',
              )}
              style={missing ? MISSING_PATTERN_STYLE : undefined}
              title={derived?.title ?? metric.fullValue}
              data-testid={`${prefix}-flow-metric-${metric.factKey}`}
              data-missing={missing ? 'true' : undefined}
              data-stale={metric.stale ? 'true' : undefined}
              data-entered={metric.entered ? 'true' : undefined}
            >
              <div className={isHeadline ? "relative flex w-full flex-col items-start px-3 py-2" : undefined}>
              <div className="truncate text-[11px] font-medium leading-4 text-muted-foreground">
                {derived ? derived.label : metric.label}
                {(derived ? derived.unit : metric.unit)
                  ? <span className="ml-1 font-normal opacity-80">{derived ? derived.unit : metric.unit}</span>
                  : null}
              </div>
              {missing ? (
                <div className="mt-0.5 text-sm font-medium leading-5 text-muted-foreground">
                  {isEnglish ? 'No value in the record' : '紀錄無值'}
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                  <div className={cn(
                    'mt-0.5 font-semibold tabular-nums',
                    isHeadline ? 'text-2xl leading-tight tracking-tight' : 'truncate text-base leading-5',
                    metric.stale ? 'text-amber-700 dark:text-amber-300' : 'text-foreground',
                  )}>
                    {displayedValue}
                  </div>
                  </div>
                  <div className="flex w-full items-center justify-between gap-2">
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
                  {isHeadline ? extra : null}
                  </div>
                </>
              )}

              {isHeadline && missing ? extra : null}
              {isHeadline ? null : extra}
              </div>
              {isHeadline && headlineExtra ? <div className="relative border-t border-border px-3 py-2 @min-[24rem]:border-l @min-[24rem]:border-t-0 @min-[40rem]:border-l-0 @min-[40rem]:border-t">{headlineExtra}</div> : null}
            </div>
          )
        })}
      </div>
      {secondRow}
    </section>
  )
}

/* --------------------------------------------------- 區塊 3 需要你判斷 */

function QuestionShell({
  question,
  prefix,
  isEnglish,
  now,
  onEdit,
  answerBadge,
  children,
}: {
  question: VisitQuestion
  prefix: string
  isEnglish: boolean
  now: Date
  onEdit?: () => void
  /** Shown beside the folded answer — the tag tally on an item question. */
  answerBadge?: ReactNode
  children?: ReactNode
}) {
  const stamp = formatStamp(question.modifiedAt, now, isEnglish)
  const open = question.state === 'open'
  const answered = question.state === 'answered'
  const sideBySide = question.inlineControl === true
  const editingInline = sideBySide && Boolean(children)
  return (
    <li
      id={visitQuestionElementId(question.id)}
      className={cn(
        'flex min-h-11 gap-2.5 px-3 py-2.5',
        open && 'bg-primary/[0.04]',
      )}
      data-testid={`${prefix}-question-${question.id}`}
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
      <div className={cn("min-w-0 flex-1", sideBySide && "@min-[64rem]:grid @min-[64rem]:grid-cols-[minmax(0,34rem)_auto] @min-[64rem]:justify-start @min-[64rem]:items-center @min-[64rem]:gap-x-6")}>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 @min-[64rem]:col-start-1">
          <span className={cn(
            'text-sm font-semibold leading-5',
            question.state === 'locked' ? 'text-muted-foreground' : 'text-foreground',
          )}>
            {question.label}
          </span>
          {answered && !editingInline && question.answerText ? (
            <span
              className="inline-flex min-h-6 items-center rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 text-xs font-semibold leading-4 text-primary"
              data-testid={`${prefix}-question-answer-${question.id}`}
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
          {answered && !editingInline && onEdit ? (
            <button
              type="button"
              className="ml-auto min-h-8 min-w-14 shrink-0 rounded-md px-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/5 pointer-coarse:min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={onEdit}
              data-testid={`${prefix}-question-edit-${question.id}`}
            >
              {isEnglish ? 'Edit' : '修改'}
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
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground @min-[64rem]:col-start-1">{question.hint}</p>
            ) : null}
            {children ? <div className={cn("mt-2", sideBySide && "@min-[64rem]:col-start-2 @min-[64rem]:row-start-1 @min-[64rem]:row-span-2 @min-[64rem]:mt-0 @min-[64rem]:max-w-[36rem]")}>{children}</div> : null}
          </>
        )}
      </div>
    </li>
  )
}

/** 「肺鬱血 2 · 體循環 2」 beside the folded answer of an item question. */
function AnswerBadgeChip({
  text,
  tally,
  prefix,
}: {
  text: string
  tally?: Readonly<Record<string, number>>
  prefix: string
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md bg-muted px-1.5 py-px text-[11px] tabular-nums text-muted-foreground"
      data-testid={`${prefix}-side-tally`}
      {...Object.fromEntries(
        Object.entries(tally ?? {}).map(([key, value]) => [`data-${key}`, value]),
      )}
    >
      {text}
    </span>
  )
}

function QuestionsCard({
  flow,
  config,
  isEnglish,
  now,
  surface,
  note,
}: {
  flow: VisitFlowModel
  config: VisitFlowDiseaseConfig
  isEnglish: boolean
  now: Date
  surface: VisitFlowSurface
  note?: ReactNode
}) {
  // A question a clinician answered can be reopened; the row is otherwise one
  // line, which is the point — the same question is not asked twice.
  const [reopened, setReopened] = useState<ReadonlySet<VisitQuestionId>>(new Set())
  const [collapsedItems, setCollapsedItems] = useState<ReadonlySet<VisitQuestionId>>(new Set())
  const prefix = config.testIdPrefix
  const reopen = (id: VisitQuestionId) => {
    setReopened(current => new Set(current).add(id))
    setCollapsedItems(current => { const next = new Set(current); next.delete(id); return next })
  }
  const shows = (question: VisitQuestion) => (
    question.items ? !collapsedItems.has(question.id) : question.state === 'open' || reopened.has(question.id)
  )
  const renderers = new Map(config.questions.map((spec) => [spec.id, spec.render]))

  return (
    <section
      className="overflow-hidden rounded-lg border border-border bg-card"
      aria-label={isEnglish ? "This visit's assessment" : '本次評估'}
      data-testid={`${prefix}-questions`}
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
          data-testid={`${prefix}-questions-remaining`}
        >
          {flow.openQuestionCount > 0
            ? (isEnglish ? `${flow.openQuestionCount} left` : `還有 ${flow.openQuestionCount} 題`)
            : (isEnglish ? 'Assessment complete' : '本次評估完成')}
        </span>
      </div>
      {note}
      {flow.readOnly ? (
        <p
          className="px-3 py-2 text-xs text-muted-foreground"
          data-testid={`${prefix}-questions-read-only`}
        >
          {isEnglish ? 'Load a patient record to answer.' : '需載入病人才能作答。'}
        </p>
      ) : null}
      <ul className="divide-y divide-border">
        {flow.questions.map((question) => {
          const editable = !flow.readOnly
          const render = renderers.get(question.id)
          return (
            <QuestionShell
              key={question.id}
              question={question}
              prefix={prefix}
              isEnglish={isEnglish}
              now={now}
              onEdit={editable ? () => reopen(question.id) : undefined}
              answerBadge={question.answerBadgeText ? (
                <AnswerBadgeChip
                  text={question.answerBadgeText}
                  tally={question.sideTally}
                  prefix={prefix}
                />
              ) : undefined}
            >
              {shows(question) && render
                ? render({
                  question,
                  isEnglish,
                  now,
                  readOnly: flow.readOnly,
                  reopen: () => reopen(question.id),
                  collapse: () => setCollapsedItems(current => new Set(current).add(question.id)),
                  surface,
                })
                : null}
            </QuestionShell>
          )
        })}
      </ul>
    </section>
  )
}

/* --------------------------------------------------- 區塊 4 今日處置 */

function conciseActionBasis(row: VisitActionRow): string | undefined {
  let basis = row.basis?.trim()
  if (!basis) return undefined

  const normalize = (value: string) => value.toLocaleLowerCase().replace(/\s+/g, ' ').trim()
  if (row.medications && normalize(basis).includes(normalize(row.medications))) return undefined

  const topic = row.moduleName.replace(/\s*(?:治療|策略|treatment|therapy|strategy)$/i, '').trim()
  for (const separator of ['：', ':']) {
    const prefix = `${topic}${separator}`
    if (topic && normalize(basis).startsWith(normalize(prefix))) {
      basis = basis.slice(prefix.length).trim()
      break
    }
  }

  const repeatedSource = /^([^：:]+)[：:]\s*(.+)$/.exec(basis)
  if (repeatedSource && normalize(repeatedSource[2]).startsWith(`${normalize(repeatedSource[1])} `)) {
    basis = repeatedSource[2]
  }
  return basis
}

function ActionsCard({
  flow,
  config,
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
  config: VisitFlowDiseaseConfig
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
  const prefix = config.testIdPrefix
  return (
    <section
      className="overflow-hidden rounded-lg border border-border bg-card"
      aria-label={isEnglish ? "Today's actions" : '今日處置'}
      data-testid={`${prefix}-actions`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-muted/40 px-3 py-1.5">
        <ListChecks className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="text-sm font-semibold text-foreground">
          {isEnglish ? "Today's actions" : '今日處置'}
        </span>
        <span
          className="ml-auto text-[11px] tabular-nums text-muted-foreground"
          data-testid={`${prefix}-actions-decided`}
        >
          {isEnglish
            ? `${flow.decidedCount} / ${flow.decidableCount} decided`
            : `已決定 ${flow.decidedCount} / ${flow.decidableCount}`}
        </span>
      </div>
      {flow.actionGroups.length === 0 ? (
        <p className="px-3 py-2.5 text-xs text-muted-foreground" data-testid={`${prefix}-actions-empty`}>
          {isEnglish ? 'Nothing to decide this visit.' : '本次無需處理。'}
        </p>
      ) : null}

      {flow.actionGroups.map((group) => {
        const collapsed = collapsedGroups.has(group.id)
        const tone = GROUP_PRESENTATION[group.id]
        return (
          <div key={group.id} data-testid={`${prefix}-action-group-${group.id}`}>
            <button
              type="button"
              className="flex h-7 w-full items-center gap-2 px-3 text-left transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              aria-expanded={!collapsed}
              onClick={() => onToggleGroup(group.id)}
              data-testid={`${prefix}-action-group-trigger-${group.id}`}
            >
              <span className={cn('flex min-w-0 shrink items-center gap-1.5', tone.toneClass)}>
                <span className="text-[11px] font-semibold leading-none">{group.label}</span>
                <span className="text-[10px] leading-none opacity-75">· {group.rows.length}</span>
                {collapsed && group.summary ? (
                  <span
                    className="min-w-0 truncate text-[11px] font-normal leading-none text-muted-foreground"
                    title={group.summary}
                    data-testid={`${prefix}-action-group-summary-${group.id}`}
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
              const basis = conciseActionBasis(row)
              const category = config.actionCategory?.(row, isEnglish)
              return (
                <Fragment key={moduleId}>
                  {config.rowBanner?.(row, group, isEnglish)}
                  <article
                    id={visitActionElementId(moduleId)}
                    className={cn(
                      'border-b border-border last:border-b-0',
                      config.rowClassName?.(row, group),
                    )}
                    data-testid={`${prefix}-action-row-${moduleId}`}
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
                            {category ? (
                              <span
                                className="inline-flex h-5 shrink-0 items-center rounded-md bg-violet-100 px-2 text-xs font-bold text-violet-800 dark:bg-violet-500/20 dark:text-violet-200"
                                data-testid={`${prefix}-action-category-${moduleId}`}
                              >
                                {category.label}
                              </span>
                            ) : null}
                            <span
                              className="min-w-0 text-sm font-semibold leading-snug text-foreground"
                              data-testid={`${prefix}-action-headline-${moduleId}`}
                            >
                              {category?.headline ?? row.headline}
                            </span>
                          </div>
                          {row.medications ? (
                            <p
                              className="mt-0.5 text-xs leading-relaxed text-muted-foreground"
                              data-testid={`${prefix}-action-medications-${moduleId}`}
                            >
                              <span className="font-medium text-foreground">
                                {isEnglish ? 'Currently taking' : '目前用藥'}：
                              </span>
                              {row.medications}
                            </p>
                          ) : null}
                          {basis ? (
                            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                              <span className="font-medium text-foreground">
                                {isEnglish ? 'Basis' : '依據'}：
                              </span>
                              {basis}
                            </p>
                          ) : null}
                          {row.coverage ? (
                            <CoverageLine
                              coverage={row.coverage}
                              isEnglish={isEnglish}
                              testIdPrefix={prefix}
                              moduleId={moduleId}
                            />
                          ) : null}
                          <DecisionControls
                            key={`${moduleId}-${row.decision?.recordedAt ?? 'none'}`}
                            row={row}
                            config={config}
                            isEnglish={isEnglish}
                            now={now}
                            editing={editingDecisions.has(moduleId)}
                            onEdit={(editing) => onEditDecision(moduleId, editing)}
                            onRecordDecision={onRecordDecision}
                            onClearDecision={onClearDecision}
                            packVersion={packVersion}
                            readOnly={flow.readOnly}
                            defaultDoseMedication={config.defaultDoseMedication?.(moduleId)}
                          />
                        </div>
                        <button
                          type="button"
                          className="flex min-h-8 shrink-0 items-center rounded-md px-1 text-primary transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-expanded={expanded}
                          aria-label={isEnglish ? 'Show decision details' : '展開決策詳情'}
                          onClick={() => onToggle(moduleId)}
                          data-testid={`${prefix}-action-expand-${moduleId}`}
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
                      data-testid={`${prefix}-action-detail-${moduleId}`}
                    >
                      {renderDetail(row.recommendation)}
                    </div>
                  ) : null}
                  </article>
                </Fragment>
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
  prefix,
  isEnglish,
  now,
  extra,
}: {
  flow: VisitFlowModel
  prefix: string
  isEnglish: boolean
  now: Date
  extra?: ReactNode
}) {
  const { copied, copy } = useCopyToClipboard()
  return (
    <section
      className="overflow-hidden rounded-lg border border-border bg-card"
      aria-label={isEnglish ? 'Record and follow-up' : '紀錄與追蹤'}
      data-testid={`${prefix}-follow-up`}
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
            void copy(flow.englishSummaryText).then((ok) => {
              if (!ok) {
                toast.error(isEnglish
                  ? 'Could not copy — the clipboard is unavailable in this context.'
                  : '無法複製，此環境無法使用剪貼簿。')
              }
            })
          }}
          data-testid={`${prefix}-copy-summary`}
        >
          {copied ? <Check className="mr-1.5 h-4 w-4" aria-hidden="true" /> : <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />}
          <span aria-live="polite">
            {copied
              ? (isEnglish ? 'Copied' : '已複製')
              : (isEnglish ? "Copy English summary" : '複製英文摘要')}
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
        data-testid={`${prefix}-summary-text`}
      >
        {flow.englishSummaryText}
      </pre>

      {flow.followUpLines.length > 0 ? (
        <div className="border-t border-border px-3 py-2" data-testid={`${prefix}-follow-up-lines`}>
          {flow.followUpLines.map((line) => (
            <p
              key={line.id}
              className="flex flex-wrap items-baseline gap-x-2 text-xs leading-relaxed"
              data-testid={`${prefix}-follow-up-${line.id}`}
            >
              <span className="font-medium text-foreground">{line.label}：</span>
              <span className="tabular-nums text-foreground">{line.value}</span>
              {line.source ? (
                <span className="text-[11px] text-muted-foreground">{line.source}</span>
              ) : null}
            </p>
          ))}
        </div>
      ) : null}

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
            <tbody data-testid={`${prefix}-carried-fields`}>
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
        <span data-testid={`${prefix}-storage-note`}>
          {isEnglish
            ? `Encrypted for this tab session ${formatStamp(now.toISOString(), now, isEnglish) ?? ''} · carrying answers across visits is phase 2`
            : `本分頁工作階段已加密保存 ${formatStamp(now.toISOString(), now, isEnglish) ?? ''} · 跨次就診沿用（第二階段）`}
        </span>
      </div>

      {extra}
    </section>
  )
}
