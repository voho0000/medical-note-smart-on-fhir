"use client"

import { useEffect, useRef, type ReactNode } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/src/shared/utils/cn.utils'
import type { CdssRecommendation } from '../../types'
import type { QueueStep } from './visit-decisions'
import { blockTitle, stateLabel } from './visit-decisions'
import type { ChainStep, DecisionPointChecklistItem, DecisionPointView, VisitAction } from '../../types'
import { VisitDecisionControls } from './VisitDecisionControls'
import { ChainStepName, StatePill } from './visit-presentation'
import { statusLabel, statusStyle, StatusIcon } from '../status-presentation'

export const VISIT_DETAIL_ID = 'cdss-visit-dp-detail'

/**
 * A point's checklist: what the record holds, one row each with its value and
 * date, then what it lacks on one line (clinician feedback 2026-09-28: 「不用缺
 * 一項就一行，可以集中一行放」).
 */
export function DecisionPointChecklist({
  items,
  isEnglish,
  compact = false,
}: {
  items: readonly DecisionPointChecklistItem[]
  isEnglish: boolean
  compact?: boolean
}) {
  const present = items.filter((item) => item.present)
  const missing = items.filter((item) => !item.present)
  return (
    <ul className={cn('grid gap-x-3 gap-y-0.5 text-xs', !compact && '@min-[40rem]:grid-cols-2')} data-testid="cdss-visit-checklist">
      {present.map((item) => (
        <li key={item.key} className="flex min-w-0 items-baseline gap-1.5" data-checklist-item={item.key} data-present="true">
          <Check className="h-3.5 w-3.5 shrink-0 self-center text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
          <span className="min-w-0 text-foreground">
            <span className="sr-only">{isEnglish ? 'In the record: ' : '已有：'}</span>
            {item.label}
            {item.value ? <span className="tabular-nums"> {item.value}</span> : null}
            {item.date ? <span className="tabular-nums text-muted-foreground">（{item.date}）</span> : null}
          </span>
        </li>
      ))}
      {missing.length > 0 ? (
        <li className="flex min-w-0 items-baseline gap-1.5 @min-[40rem]:col-span-2" data-testid="cdss-visit-checklist-missing" data-present="false">
          <span className="shrink-0 font-semibold text-amber-800 dark:text-amber-300">{isEnglish ? 'Missing' : '缺'}</span>
          <span className="min-w-0 text-muted-foreground">
            {missing.map((item) => (
              <span key={item.key} data-checklist-item={item.key} data-present="false">{item.label}</span>
            )).flatMap((node, index) => (index === 0 ? [node] : [isEnglish ? ', ' : '、', node]))}
          </span>
        </li>
      ) : null}
    </ul>
  )
}

const STEP_STATE: Record<ChainStep['state'], { zh: string; en: string; className: string }> = {
  done: { zh: '完成', en: 'Done', className: 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/25 dark:bg-emerald-500/10' },
  current: { zh: '卡在這', en: 'Here now', className: 'border-amber-300 bg-amber-50/70 dark:border-amber-500/35 dark:bg-amber-500/10' },
  later: { zh: '之後', en: 'Later', className: 'border-border bg-muted/30' },
  blocked: { zh: '受阻', en: 'Blocked', className: 'border-destructive/40 bg-destructive/5' },
}

/**
 * One opened map cell: the pack's question and reason, each step of its
 * decision chain, the same decision control the queue row shows, and the
 * cards behind it drawn by the existing detail renderer — evidence tables and
 * all. A card that the model names but the result does not hold is skipped;
 * nothing is synthesised in its place.
 */
export function DecisionPointDetail({
  extras,
  point,
  steps,
  isEnglish,
  sourceOfPage,
  modules,
  renderDetail,
  onDecide,
  onClear,
  onClose,
}: {
  point: DecisionPointView
  /**
   * The point's steps as far as today's decisions reach — the point, and its
   * next step once the action revealing it was recorded — from the same store
   * the queue row reads.
   */
  steps: readonly QueueStep[]
  isEnglish: boolean
  sourceOfPage: DecisionPointView['source']
  modules: ReadonlyMap<string, CdssRecommendation>
  renderDetail: (recommendation: CdssRecommendation) => ReactNode
  onDecide?: (step: QueueStep, action: VisitAction) => void
  onClear?: (step: QueueStep) => void
  onClose: () => void
  /** The page's own inputs this point reads — questions, confirmation, calculator. */
  extras?: ReactNode
}) {
  const decision = [...steps].reverse().find((step) => step.decision)?.decision
  const headingRef = useRef<HTMLHeadingElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  // Opening a cell moves focus to what it opened, so a keyboard or screen
  // reader user lands on the card rather than having to find it. The page
  // scrolls only as far as the decision buttons: the card opens right under
  // the cell that was pressed, and the clinician should not have to scroll to
  // answer it — nor lose sight of the cell they pressed.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
    const controls = sectionRef.current?.querySelector<HTMLElement>('[data-visit-detail-step]')
    ;(controls ?? headingRef.current)?.scrollIntoView?.({ block: 'nearest' })
  }, [point.dp, point.source])

  const cards = point.moduleIds.flatMap((id) => {
    const recommendation = modules.get(id)
    return recommendation ? [recommendation] : []
  })
  return (
    <section
      ref={sectionRef}
      id={VISIT_DETAIL_ID}
      aria-labelledby={`${VISIT_DETAIL_ID}-title`}
      className="space-y-3 rounded-lg border border-border bg-card p-3"
      data-testid="cdss-visit-detail"
      data-dp={point.dp}
      data-state={point.state}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <h4
            id={`${VISIT_DETAIL_ID}-title`}
            ref={headingRef}
            tabIndex={-1}
            className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="font-mono">{point.dp}</span>
            <span>{point.label}</span>
            <StatePill state={point.state} isEnglish={isEnglish} decided={Boolean(decision)} />
            {point.source !== sourceOfPage ? (
              <Badge variant="outline" className="h-5 px-1.5 text-[11px]">{point.source.toUpperCase()}</Badge>
            ) : null}
          </h4>
          <p className="text-xs text-muted-foreground">{blockTitle(point.block, isEnglish)}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="h-11 min-w-11 px-3"
          onClick={onClose}
          aria-label={isEnglish ? `Close ${point.dp}` : `收起 ${point.dp}`}
          data-testid="cdss-visit-detail-close"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {point.headline || point.why ? (
        <div className="space-y-0.5">
          {point.headline ? <p className="text-sm font-medium text-foreground">{point.headline}</p> : null}
          {point.why ? <p className="text-xs leading-relaxed text-muted-foreground">{point.why}</p> : null}
        </div>
      ) : null}

      {point.chain?.length ? (
        <ol className="grid gap-2 @min-[40rem]:grid-cols-3" aria-label={isEnglish ? 'Decision chain' : '決策鏈'}>
          {point.chain.map((step, index) => (
            <li
              key={step.id}
              className={cn('space-y-1 rounded-md border px-3 py-2', STEP_STATE[step.state].className)}
              data-chain-step={step.id}
              data-chain-state={step.state}
            >
              <p className="text-xs font-semibold text-foreground">
                {index + 1}. <ChainStepName id={step.id} isEnglish={isEnglish} />
                {' · '}
                {isEnglish ? STEP_STATE[step.state].en : STEP_STATE[step.state].zh}
              </p>
              <p className="text-xs leading-relaxed text-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
      ) : null}

      {point.checklist?.length ? <DecisionPointChecklist items={point.checklist} isEnglish={isEnglish} /> : null}

      {point.needsData?.length ? (
        <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300" data-testid="cdss-visit-detail-needs-data">
          {isEnglish ? 'Not in the record: ' : '紀錄裡還缺：'}
          {point.needsData.join(isEnglish ? ', ' : '、')}
        </p>
      ) : null}

      {steps.map((step, index) => (step.point.actions.length ? (
        <div key={step.key} className="space-y-1" data-visit-detail-step={step.key}>
          {index > 0 ? (
            <div className="space-y-0.5 border-t border-border pt-2">
              {step.point.headline ? <p className="text-sm font-medium text-foreground">{step.point.headline}</p> : null}
              {step.point.why ? <p className="text-xs leading-relaxed text-muted-foreground">{step.point.why}</p> : null}
            </div>
          ) : null}
          <VisitDecisionControls
            point={step.point}
            decision={step.decision}
            surface="map"
            isEnglish={isEnglish}
            onDecide={onDecide ? (action) => onDecide(step, action) : undefined}
            onClear={onClear ? () => onClear(step) : undefined}
          />
        </div>
      ) : null))}

      {extras ? (
        <div className="space-y-2 border-t border-border pt-3" data-testid="cdss-visit-detail-extras">
          {extras}
        </div>
      ) : null}

      {point.guideline ? (
        // What the guideline says about this decision, folded like the
        // evidence below: the points in the page's language, then each cited
        // recommendation with its section, page, class and level.
        <details className="group/guide rounded-md border border-border" data-testid="cdss-visit-detail-guideline">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1 truncate text-foreground">{isEnglish ? 'Guideline points' : '指引重點'}</span>
            <span className="shrink-0 font-normal">{[...new Set(point.guideline.references.map((reference) => reference.source))].join(isEnglish ? ', ' : '、')}</span>
            <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open/guide:rotate-180" aria-hidden="true" />
          </summary>
          <div className="space-y-2 border-t border-border px-3 pb-2.5 pt-2">
            <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-foreground" data-testid="cdss-visit-detail-guideline-points">
              {point.guideline.points.map((line) => <li key={line}>{line}</li>)}
            </ul>
            <ol className="space-y-1.5" data-testid="cdss-visit-detail-guideline-references">
              {point.guideline.references.map((reference) => (
                <li key={`${reference.section}-${reference.page}-${reference.quote.slice(0, 24)}`} className="text-[11px] leading-4 text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {reference.source} §{reference.section} · p.{reference.page}
                    {reference.recommendation ? ` · Class ${reference.recommendation.class}, ${reference.recommendation.level}` : ''}
                  </span>
                  {isEnglish ? ': ' : '：'}
                  <span lang="en">“{reference.quote}”</span>
                </li>
              ))}
            </ol>
          </div>
        </details>
      ) : null}

      {cards.length ? (
        <div className="space-y-2 border-t border-border pt-2">
          {cards.map((recommendation) => (
            // The guideline and the patient's evidence behind the point, folded:
            // a clinician who knows the guidance decides from the question and
            // the buttons above, and opens this only when they want to check.
            <details
              key={recommendation.id}
              className="group/evidence rounded-md border border-border"
              data-testid={`cdss-visit-detail-module-${recommendation.id}`}
            >
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                {/* The card's own status, as the pack returned it. The cell
                    above reads the same module's visit decision, so the two
                    agree; no host re-grade is applied on the map. */}
                <Badge className={cn('h-5 px-1.5 text-[11px]', statusStyle[recommendation.status])} data-module-status={recommendation.status}>
                  <StatusIcon status={recommendation.status} />
                  {statusLabel(recommendation.status, isEnglish)}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-foreground">{recommendation.moduleName ?? recommendation.title}</span>
                <span className="shrink-0 font-normal">{isEnglish ? 'Guideline and evidence' : '指引與依據'}</span>
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open/evidence:rotate-180" aria-hidden="true" />
              </summary>
              <div className="border-t border-border px-1 pb-2 pt-2" data-testid={`cdss-visit-detail-module-body-${recommendation.id}`}>
                {renderDetail(recommendation)}
              </div>
            </details>
          ))}
        </div>
      ) : point.guideline ? null : (
        <p className="text-xs text-muted-foreground">
          {point.state === 'not-included'
            ? (isEnglish ? 'No module computes this decision point yet.' : '這個決策點還沒有對應的模組。')
            : (isEnglish ? `${stateLabel(point.state, true)}; no module card behind this point.` : `${stateLabel(point.state, false)}；這一點沒有對應的模組卡。`)}
        </p>
      )}
    </section>
  )
}
