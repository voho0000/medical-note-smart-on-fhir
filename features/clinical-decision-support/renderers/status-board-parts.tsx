"use client"

/**
 * The pieces every disease status board is built from: one input cell, one
 * therapy tile, one safety-alert row, one coverage line, and the form that puts
 * a measurement taken in the room back into the pack.
 *
 * They live here so a second disease is a config and a layout, not a second
 * copy of the same six hundred lines. Every string a clinician reads still
 * comes from the pack; what this file owns is how a missing value is drawn, how
 * a date is aged, and where a badge sits.
 */
import { type ReactNode } from 'react'
import { ArrowRight, Check, ChevronDown, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/src/shared/utils/cn.utils'
import type { CdssRecommendation } from '../types'
import {
  type BoardCoverage,
  type BoardMetric,
  type BoardMetricKind,
  type BoardPillar,
  type BoardText,
  formatMetricDate,
} from './disease-board'
import {
  sourceStatusLabel,
  sourceStatusStyle,
  statusLabel,
  statusStyle,
  StatusIcon,
} from './status-presentation'

export const MISSING_PATTERN_STYLE = { backgroundImage: 'var(--clinical-missing-data-pattern)' } as const

/**
 * How a missing input is obtained, by kind. A derived value is not ordered and
 * not measured: non-HDL-C falls out of a TC and an HDL-C drawn the same day,
 * so the caption names the two the clinician is short of rather than sending
 * them to the lab for a test that does not exist.
 */
const HOW_TO_GET: Readonly<Record<BoardMetricKind, BoardText>> = {
  lab: { zh: '可開單檢驗', en: 'Laboratory order' },
  measure: { zh: '診間量測', en: 'Measure in clinic' },
  derived: { zh: '同日 TC 與 HDL-C 可算出', en: 'Derived from same-day TC and HDL-C' },
}

export function ageLabel(metric: BoardMetric, isEnglish: boolean, now: Date): string | undefined {
  const date = formatMetricDate(metric.date, now)
  if (!date) return undefined
  if (metric.entered) {
    return metric.ageDays === 0
      ? (isEnglish ? 'Entered today' : '今天 · 門診輸入')
      : `${date} · ${isEnglish ? 'entered' : '門診輸入'}`
  }
  if (metric.ageDays === undefined) return date
  if (metric.ageDays === 0) return `${date} · ${isEnglish ? 'today' : '今天'}`
  return `${date} · ${isEnglish ? `${metric.ageDays}d` : `${metric.ageDays}天`}`
}

export function ExpandChevron({ expanded }: { expanded: boolean }) {
  return (
    <ChevronDown
      className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')}
      aria-hidden="true"
    />
  )
}

export function MetricCell({
  metric,
  isEnglish,
  now,
  testIdPrefix,
}: {
  metric: BoardMetric
  isEnglish: boolean
  now: Date
  testIdPrefix: string
}) {
  const missing = metric.value === undefined
  const howToGet = HOW_TO_GET[metric.kind][isEnglish ? 'en' : 'zh']
  return (
    <div
      className={cn(
        'min-w-0 border-l border-t border-border/60 px-2 py-2',
        missing && 'bg-muted/50',
      )}
      style={missing ? MISSING_PATTERN_STYLE : undefined}
      title={metric.fullValue}
      data-testid={`${testIdPrefix}-metric-${metric.factKey}`}
      data-missing={missing ? 'true' : undefined}
      data-stale={metric.stale ? 'true' : undefined}
      data-entered={metric.entered ? 'true' : undefined}
    >
      <div className="truncate text-xs font-medium leading-4 text-muted-foreground">
        {metric.label}
        {metric.unit ? <span className="ml-1 font-normal opacity-80">{metric.unit}</span> : null}
      </div>
      {missing ? (
        <>
          <div className="mt-0.5 text-sm font-medium leading-5 text-muted-foreground">
            {isEnglish ? 'Not available' : '未取得'}
          </div>
          <div className="text-xs leading-4 text-amber-700 dark:text-amber-300">{howToGet}</div>
        </>
      ) : (
        <>
          <div className="mt-0.5 truncate text-base font-semibold leading-5 tabular-nums text-foreground">
            {metric.value}
          </div>
          {/* The date and the age wrap rather than truncate: a value eight years
              old says so in the half of the line an ellipsis would eat. */}
          <div
            className={cn(
              'text-xs leading-4 tabular-nums',
              metric.stale
                ? 'font-medium text-amber-700 dark:text-amber-300'
                : metric.entered
                  ? 'font-medium text-primary'
                  : 'text-muted-foreground',
            )}
          >
            {ageLabel(metric, isEnglish, now) ?? (metric.stale ? (isEnglish ? 'Past window' : '已超過窗期') : '')}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * The inputs strip. Cells draw their own top and left rules and the grid is
 * pulled a pixel up and left, so the outer rules fall outside the clipped box
 * however many columns the width leaves — one row or three.
 */
export function MetricStrip({
  metrics,
  columnsClass,
  isEnglish,
  now,
  testIdPrefix,
}: {
  metrics: readonly BoardMetric[]
  columnsClass: string
  isEnglish: boolean
  now: Date
  testIdPrefix: string
}) {
  return (
    <div className="overflow-hidden">
      <div className={cn('-ml-px -mt-px grid', columnsClass)}>
        {metrics.map((metric) => (
          <MetricCell
            key={metric.factKey}
            metric={metric}
            isEnglish={isEnglish}
            now={now}
            testIdPrefix={testIdPrefix}
          />
        ))}
      </div>
    </div>
  )
}

/** The pack's 健保給付 verdict for one card, printed as the pack wrote it. */
export function CoverageLine({
  coverage,
  isEnglish,
  className,
  testId,
}: {
  coverage: BoardCoverage
  isEnglish: boolean
  className?: string
  testId: string
}) {
  return (
    <span
      className={cn('flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1 text-xs leading-relaxed', className)}
      data-testid={testId}
      data-coverage-status={coverage.status}
      title={coverage.summary}
    >
      <span className="inline-flex items-baseline gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">{coverage.sourceLabel}</span>
        <Badge className={cn('h-5 shrink-0 px-1.5 text-xs', sourceStatusStyle[coverage.status])}>
          {sourceStatusLabel(coverage.status, isEnglish)}
        </Badge>
      </span>
      <span className="min-w-0 text-muted-foreground">{coverage.firstSentence}</span>
    </span>
  )
}

/**
 * One therapy tile.
 *
 * `variant: 'module'` is a pillar the pack evaluated as its own module: it
 * carries that module's status and next step. `variant: 'row'` is one therapy
 * row of a module that lists several — the judgement belongs to the section
 * heading, so the tile shows what the patient is on and nothing else.
 */
export function PillarTile({
  pillar,
  variant,
  isEnglish,
  now,
  expanded,
  expandable,
  onToggle,
  testIdPrefix,
  className,
  detailId,
}: {
  pillar: BoardPillar
  detailId?: string
  variant: 'module' | 'row'
  isEnglish: boolean
  now: Date
  expanded: boolean
  expandable: boolean
  onToggle: () => void
  testIdPrefix: string
  /** Layout only: how the row that owns the tile sizes it. */
  className?: string
}) {
  const therapyDate = formatMetricDate(pillar.therapyDate, now)
  const gap = pillar.status === 'actionable' || pillar.status === 'needs-data'
  // A tile with no detail behind it is a plain card: it shows the prescription
  // state and nothing else, and there is nothing to open.
  const Tile: 'button' | 'div' = expandable ? 'button' : 'div'
  return (
    <Tile
      {...(expandable
        ? {
            type: 'button' as const,
            'aria-expanded': expanded,
            'aria-controls': detailId ?? `${testIdPrefix}-pillar-detail-${pillar.id}`,
            onClick: onToggle,
          }
        : {})}
      className={cn(
        'flex min-h-11 min-w-0 flex-col gap-1.5 rounded-md border border-border bg-card px-3 py-2.5 text-left',
        expandable && 'transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        expanded && 'bg-muted/25',
        className,
      )}
      data-testid={`${testIdPrefix}-pillar-${pillar.id}`}
      data-taking={pillar.taking ? 'true' : 'false'}
      data-evaluated={pillar.evaluated ? 'true' : 'false'}
    >
      <span className="flex min-w-0 flex-col items-start gap-1">
        <span className="text-xs font-semibold leading-4 text-muted-foreground">{pillar.label}</span>
        {pillar.status ? (
          <Badge className={cn('h-5 shrink-0 px-1.5 text-xs', statusStyle[pillar.status])}>
            <StatusIcon status={pillar.status} />
            {pillar.taking && pillar.status === 'no-action'
              ? (isEnglish ? 'Taking' : '使用中')
              : statusLabel(pillar.status, isEnglish)}
          </Badge>
        ) : variant === 'module' ? (
          <Badge className="h-5 shrink-0 bg-muted px-1.5 text-xs text-muted-foreground hover:bg-muted">
            {pillar.taking
              ? (isEnglish ? 'Taking · not assessed' : '使用中 · 本次未判定')
              : (isEnglish ? 'Not assessed' : '本次未判定')}
          </Badge>
        ) : pillar.taking ? (
          <Badge className="h-5 shrink-0 bg-emerald-100 px-1.5 text-xs text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200">
            <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            {isEnglish ? 'Taking' : '使用中'}
          </Badge>
        ) : null}
      </span>
      <span className="min-w-0">
        {pillar.taking ? (
          <>
            <span className="line-clamp-2 break-words text-sm font-semibold leading-5 text-foreground" title={pillar.medicationNames}>
              {pillar.medicationNames}
            </span>
            <span className="block truncate text-xs leading-4 tabular-nums text-muted-foreground">
              {[therapyDate, isEnglish ? 'Taking' : '使用中'].filter(Boolean).join(' · ')}
            </span>
          </>
        ) : (
          <span
            className="line-clamp-2 max-w-full break-words rounded-sm bg-muted/50 px-1.5 text-sm font-medium leading-5 text-muted-foreground"
            style={MISSING_PATTERN_STYLE}
            title={pillar.therapyText}
          >
            {pillar.therapyText ?? (isEnglish ? 'No prescription found' : '未見處方')}
          </span>
        )}
      </span>
      {pillar.note ? (
        <span
          className="flex min-w-0 gap-1.5 border-t border-border/60 pt-1.5 text-xs leading-relaxed text-amber-700 dark:text-amber-300"
          data-testid={`${testIdPrefix}-pillar-note-${pillar.id}`}
        >
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="line-clamp-3 break-words">{pillar.note}</span>
        </span>
      ) : null}
      {pillar.nextAction ? (
        <span className={cn(
          'flex min-w-0 gap-1.5 border-t border-border/60 pt-1.5 text-xs leading-relaxed',
          gap ? 'text-foreground' : 'text-muted-foreground',
        )}>
          {gap
            ? <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            : <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
          <span className="line-clamp-3 break-words">{pillar.nextAction}</span>
        </span>
      ) : null}
    </Tile>
  )
}

/**
 * The mark between two tiles of a therapy sequence.
 *
 * Some treatments are a ladder rather than a set of equal tracks: the classes
 * are added one after another, and a row of identical tiles says the opposite.
 * The glyph is decoration — it carries no threshold, no interval and no
 * condition, because the words that say when a step is taken are the pack's
 * and are printed on its card. It is hidden from assistive technology; the
 * order a screen reader hears is the order the tiles are in.
 */
export function PillarSequenceConnector({ testId }: { testId?: string }) {
  return (
    <span
      className="flex shrink-0 items-center self-stretch px-0.5 text-sm leading-none text-muted-foreground"
      aria-hidden="true"
      data-testid={testId}
    >
      →
    </span>
  )
}

/**
 * Safety modules the pack marked actionable: the one thing to see before
 * anything else, one row each, expanding the same detail the list opens.
 */
export function BoardAlerts({
  alerts,
  isEnglish,
  expandedId,
  onToggle,
  renderDetail,
  testIdPrefix,
}: {
  alerts: readonly CdssRecommendation[]
  isEnglish: boolean
  expandedId: string | null
  onToggle: (id: string) => void
  renderDetail: (recommendation: CdssRecommendation) => ReactNode
  testIdPrefix: string
}) {
  return (
    <>
      {alerts.map((alert) => {
        const expanded = expandedId === alert.id
        const overviewKeys = alert.overviewEvidenceFactKeys
          ?? (alert.overviewEvidenceFactKey ? [alert.overviewEvidenceFactKey] : [])
        const overview = overviewKeys.flatMap((key) => {
          const item = alert.patientEvidence.find((evidence) => evidence.factKeys.includes(key))
          return item ? [item] : []
        })
        const detailId = `${testIdPrefix}-alert-detail-${alert.id}`
        return (
          <section
            key={alert.id}
            className="overflow-hidden rounded-lg border border-border bg-card"
            aria-label={isEnglish ? 'Safety alert' : '安全警訊'}
            data-testid={`${testIdPrefix}-alert-${alert.id}`}
          >
            <button
              type="button"
              className={cn(
                'grid min-h-11 w-full gap-x-3 gap-y-1 bg-amber-50 px-3 py-2.5 text-left transition-colors hover:bg-amber-100/60 dark:bg-amber-500/[0.08] dark:hover:bg-amber-500/[0.14]',
                'grid-cols-[1.25rem_minmax(0,1fr)_1rem] @min-[40rem]:grid-cols-[1.25rem_minmax(0,1.15fr)_minmax(0,0.9fr)_1rem] @min-[40rem]:items-start',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
              )}
              aria-expanded={expanded}
              aria-controls={detailId}
              onClick={() => onToggle(alert.id)}
              data-testid={`${testIdPrefix}-alert-trigger-${alert.id}`}
            >
              <TriangleAlert className="mt-0.5 h-[18px] w-[18px] text-amber-700 dark:text-amber-300" aria-hidden="true" />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold leading-5 text-foreground">{alert.title}</span>
                  <Badge className={cn('h-5 px-1.5 text-xs', statusStyle[alert.status])}>
                    <StatusIcon status={alert.status} />
                    {statusLabel(alert.status, isEnglish)}
                    {alert.priority === 'high' ? (isEnglish ? ' · Priority' : ' · 優先') : ''}
                  </Badge>
                </span>
                {overview.map((evidence) => (
                  <span
                    key={`${evidence.label}-${evidence.value}`}
                    className="mt-0.5 block text-xs leading-relaxed text-muted-foreground"
                  >
                    <span className="font-medium text-foreground">{evidence.label}：</span>
                    {evidence.value}
                  </span>
                ))}
              </span>
              <span className="col-span-full pl-8 text-xs leading-relaxed text-foreground @min-[40rem]:col-span-1 @min-[40rem]:pl-0">
                {alert.nextActions[0]}
              </span>
              <span className="col-start-3 row-start-1 @min-[40rem]:col-start-4">
                <ExpandChevron expanded={expanded} />
              </span>
            </button>
            {expanded ? (
              <div id={detailId} role="region" className="border-t border-border bg-background" data-testid={detailId}>
                {renderDetail(alert)}
              </div>
            ) : null}
          </section>
        )
      })}
    </>
  )
}
