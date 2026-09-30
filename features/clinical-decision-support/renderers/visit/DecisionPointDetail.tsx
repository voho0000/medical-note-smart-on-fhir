"use client"

import { useEffect, useRef, type ReactNode } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/src/shared/utils/cn.utils'
import type { CdssRecommendation } from '../../types'
import type { QueueStep } from './visit-decisions'
import { blockTitle, sourceTag, stateLabel } from './visit-decisions'
import type { ChainStep, DecisionPointChecklistItem, DecisionPointView, VisitAction } from '../../types'
import { VisitDecisionControls } from './VisitDecisionControls'
import { ChainStepName } from './visit-presentation'
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
        // Spanning both columns only where there are two: on the map's compact
        // list a span would add an implicit second column.
        <li className={cn('flex min-w-0 items-baseline gap-1.5', !compact && '@min-[40rem]:col-span-2')} data-testid="cdss-visit-checklist-missing" data-present="false">
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

const STEP_STATE: Record<ChainStep['state'], { zh: string; en: string; className: string; shown: boolean }> = {
  done: { zh: '完成', en: 'Done', className: 'text-muted-foreground', shown: false },
  current: { zh: '卡在這', en: 'Here now', className: 'bg-amber-50 text-foreground ring-1 ring-amber-300 dark:bg-amber-500/10 dark:ring-amber-500/35', shown: true },
  later: { zh: '之後', en: 'Later', className: 'text-muted-foreground', shown: false },
  blocked: { zh: '受阻', en: 'Blocked', className: 'bg-destructive/5 text-foreground ring-1 ring-destructive/40', shown: true },
}

/**
 * The decision chain on one line — 1. 要不要 開始 MRA（卡在這）→ 2. 哪一種
 * spironolactone → 3. 劑量 起始 12.5–25 mg o.d. — rather than three boxes
 * that restate, larger, the question printed just above (clinician feedback
 * 2026-09-30: 「你不覺得畫面很亂」). Where the chain stands is marked on its
 * step: 卡在這 or 受阻 in words, a finished step with a tick.
 */
function DecisionChainLine({ chain, isEnglish }: { chain: readonly ChainStep[]; isEnglish: boolean }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs leading-5" aria-label={isEnglish ? 'Decision chain' : '決策鏈'}>
      {chain.map((step, index) => {
        const state = STEP_STATE[step.state]
        return (
          <li key={step.id} className="flex min-w-0 max-w-full items-center gap-1" data-chain-step={step.id} data-chain-state={step.state}>
            {index > 0 ? <span className="shrink-0 text-muted-foreground" aria-hidden="true">→</span> : null}
            <span className={cn('inline-flex min-w-0 max-w-full flex-wrap items-baseline gap-x-1 rounded px-1.5', state.className)}>
              {step.state === 'done' ? <Check className="h-3 w-3 shrink-0 self-center text-emerald-700 dark:text-emerald-300" aria-hidden="true" /> : null}
              <span className="shrink-0 font-medium">{index + 1}. <ChainStepName id={step.id} isEnglish={isEnglish} /></span>
              <span className="min-w-0 break-words">{step.text}</span>
              <span className={cn('shrink-0 font-semibold', !state.shown && 'sr-only')}>
                {isEnglish ? ` (${state.en})` : `（${state.zh}）`}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
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
  shownAbove = { headline: false, why: false },
  steps,
  isEnglish,
  sourceOfPage,
  modules,
  renderDetail,
  onDecide,
  onClear,
  decidedWith,
  onClose,
  controlsAbove,
}: {
  point: DecisionPointView
  /**
   * What the line the card opens under already prints — the pack's question,
   * its reason — so the card leaves it out. The DP code, name and state are
   * always on that line.
   */
  shownAbove?: { headline: boolean; why: boolean }
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
  /**
   * The point whose row decides this one (DP-07 for DP-08／DP-09): `steps` is
   * that row's step, and the card says where its decision lives.
   */
  decidedWith?: DecisionPointView
  onClose: () => void
  /** The page's own inputs this point reads — questions, confirmation, calculator. */
  extras?: ReactNode
  /**
   * The step whose buttons (or recorded decision) the row the card opens
   * under already draws, so the card leaves them out.
   */
  controlsAbove?: string
}) {
  // 「已記錄」 once every step shown is: a chain whose next step is still open
  // (the DOAC after 「開始抗凝」) says its state instead.
  const decision = steps.every((step) => step.decision) ? steps[steps.length - 1]?.decision : undefined
  // What the record lacks, said once: the checklist's 「缺」 line already names
  // the items it lists (clinician feedback 2026-09-28: 「不然等於兩個地方都有」).
  const listedMissing = new Set((point.checklist ?? []).filter((item) => !item.present).map((item) => item.label))
  const needsData = (point.needsData ?? []).filter((item) => !listedMissing.has(item))
  const headingRef = useRef<HTMLHeadingElement>(null)
  const showHeadline = Boolean(point.headline) && !shownAbove.headline
  const showWhy = Boolean(point.why) && !shownAbove.why
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
      // Clear of the steps held at the top of the details as they scroll
      // (measured on the details by DecisionMapColumns).
      className={cn('relative scroll-mt-[var(--cdss-steps-clear,0.5rem)] space-y-3 rounded-lg border border-border bg-card p-3', !showHeadline && !showWhy && 'pr-11')}
      data-testid="cdss-visit-detail"
      data-dp={point.dp}
      data-state={point.state}
    >
      {/* The line above already names the point (DP code, name, state): the
          card opens with only 收起, beside whatever of the question and its
          reason that line does not print (clinician decision 2026-09-28:
          「卡片開頭精簡成只剩關閉鈕」). The heading stays for a screen reader
          and for focus. */}
      <div className={cn('flex items-start gap-2', !showHeadline && !showWhy && 'contents')}>
        <div className={cn('min-w-0 flex-1 space-y-0.5', !showHeadline && !showWhy && 'contents')}>
          <h4
            id={`${VISIT_DETAIL_ID}-title`}
            ref={headingRef}
            tabIndex={-1}
            className="sr-only"
          >
            {point.dp} {point.label}
            {' · '}
            {decision ? (isEnglish ? 'Recorded' : '已記錄') : decidedWith ? (isEnglish ? 'To decide' : '待決定') : stateLabel(point.state, isEnglish)}
            {point.source !== sourceOfPage ? ` · ${sourceTag(point)}` : ''}
            {' · '}
            {blockTitle(point.block, isEnglish)}
          </h4>
          {showHeadline ? <p className="text-sm font-medium text-foreground">{point.headline}</p> : null}
          {showWhy ? <p className="text-xs leading-relaxed text-muted-foreground">{point.why}</p> : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          // With nothing beside it, 收起 sits in the corner and the card's
          // content starts at its top rather than under an empty line.
          className={cn(
            'h-8 min-w-8 shrink-0 px-2 pointer-coarse:h-11 pointer-coarse:min-w-11',
            showHeadline || showWhy ? '-mr-1 -mt-1' : 'absolute right-1.5 top-1.5 !mt-0',
          )}
          onClick={onClose}
          aria-label={isEnglish ? `Close ${point.dp}` : `收起 ${point.dp}`}
          data-testid="cdss-visit-detail-close"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {decidedWith ? (
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground" data-testid="cdss-visit-detail-decided-with" data-dp={decidedWith.dp}>
            {isEnglish
              ? `Decided with ${decidedWith.dp} ${decidedWith.label}`
              : `與 ${decidedWith.dp} ${decidedWith.label} 一起決定`}
          </p>
          {/* What the choice rests on — the valve premise, CrCl, the dose
              criteria, what is left to an individual assessment — as DP-07's
              row gives it: the choice made here is the same one (#196 review). */}
          {steps[0]?.point.why ? (
            <p className="text-xs leading-relaxed text-muted-foreground" data-testid="cdss-visit-detail-decided-with-why">
              {steps[0].point.why}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Its own chain waits on the step decided here: not drawn over it. */}
      {point.chain?.length && !decidedWith ? <DecisionChainLine chain={point.chain} isEnglish={isEnglish} /> : null}

      {point.checklist?.length ? <DecisionPointChecklist items={point.checklist} isEnglish={isEnglish} /> : null}

      {needsData.length ? (
        <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300" data-testid="cdss-visit-detail-needs-data">
          {isEnglish ? 'Not in the record: ' : '紀錄裡還缺：'}
          {needsData.join(isEnglish ? ', ' : '、')}
        </p>
      ) : null}

      {/* A step whose buttons the row above already draws is not drawn
          again here: one 「開始 MRA」, on the row (clinician feedback
          2026-09-30: 「光開始MRA按鈕就出現兩次」). */}
      {steps.map((step, index) => (step.point.actions.length && step.key !== controlsAbove ? (
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

      {point.guideline || cards.length ? (
        // What the guideline says about this decision and the patient's
        // evidence behind it, in one fold (clinician feedback 2026-09-30: two
        // folds, 「指引重點」 and each card's 「指引與依據」, read as clutter): the
        // points in the page's language, each cited recommendation with its
        // section, page, class and level, then the cards the point rests on.
        // A clinician who knows the guidance decides from the row above and
        // opens this only to check.
        <details className="group/evidence rounded-md border border-border" data-testid="cdss-visit-detail-evidence">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1 truncate text-foreground">{isEnglish ? 'Guideline and evidence' : '指引與依據'}</span>
            <span className="min-w-0 truncate font-normal">
              {point.guideline
                ? [...new Set(point.guideline.references.map((reference) => reference.source))].join(isEnglish ? ', ' : '、')
                : cards.map((recommendation) => recommendation.moduleName ?? recommendation.title).join(isEnglish ? ', ' : '、')}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open/evidence:rotate-180" aria-hidden="true" />
          </summary>
          <div className="space-y-3 border-t border-border px-3 pb-2.5 pt-2">
            {point.guideline ? (
              <div className="space-y-2" data-testid="cdss-visit-detail-guideline">
                <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-foreground" data-testid="cdss-visit-detail-guideline-points">
                  {point.guideline.points.map((line) => <li key={line}>{line}</li>)}
                </ul>
                <ol className="space-y-1.5" data-testid="cdss-visit-detail-guideline-references">
                  {point.guideline.references.map((reference) => (
                    // The whole quote: two lines of one section and page can open alike (DP-12's 「Intravenous iron supplementation…」).
                    <li key={`${reference.source}|${reference.section}|${reference.page}|${reference.quote}`} className="text-[11px] leading-4 text-muted-foreground">
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
            ) : null}
            {cards.map((recommendation) => (
              <section
                key={recommendation.id}
                className={cn('space-y-1.5', point.guideline && 'border-t border-border pt-2.5')}
                aria-label={recommendation.moduleName ?? recommendation.title}
                data-testid={`cdss-visit-detail-module-${recommendation.id}`}
              >
                <p className="flex min-w-0 items-center gap-2 text-xs font-semibold text-foreground">
                  {/* The card's own status, as the pack returned it. The row
                      above reads the same module's visit decision, so the
                      two agree; no host re-grade is applied on the map. */}
                  <Badge className={cn('h-5 px-1.5 text-[11px]', statusStyle[recommendation.status])} data-module-status={recommendation.status}>
                    <StatusIcon status={recommendation.status} />
                    {statusLabel(recommendation.status, isEnglish)}
                  </Badge>
                  <span className="min-w-0 truncate">{recommendation.moduleName ?? recommendation.title}</span>
                </p>
                <div className="-mx-2" data-testid={`cdss-visit-detail-module-body-${recommendation.id}`}>
                  {renderDetail(recommendation)}
                </div>
              </section>
            ))}
          </div>
        </details>
      ) : decidedWith ? null : (
        <p className="text-xs text-muted-foreground">
          {point.state === 'not-included'
            ? (isEnglish ? 'No module computes this decision point yet.' : '這個決策點還沒有對應的模組。')
            : (isEnglish ? `${stateLabel(point.state, true)}; no module card behind this point.` : `${stateLabel(point.state, false)}；這一點沒有對應的模組卡。`)}
        </p>
      )}
    </section>
  )
}
