"use client"

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/src/shared/utils/cn.utils'
import type { PointDecision } from './visit-decisions'
import {
  ABSENT_STATES,
  BLOCK_ORDER,
  DECISION_STATES,
  blockTitle,
  stateLabel,
  visitDecisionKey,
} from './visit-decisions'
import type { DecisionPointState, DecisionPointView, VisitBlock, VisitDecisionModel } from '../../types'
import { ChainDots, StatePill } from './visit-presentation'
import { DecisionPointChecklist, VISIT_DETAIL_ID } from './DecisionPointDetail'

/**
 * States that need the clinician; a column holding one never folds. 「等你回答」
 * is not among them: those points wait on the every-visit asks, which are
 * always open above the queue, and DP-03 would otherwise keep 01 unfolded at
 * every follow-up visit.
 */
const NEEDS_CLINICIAN: ReadonlySet<DecisionPointState> = DECISION_STATES

const LEGEND_ORDER: readonly DecisionPointState[] = [
  'safety', 'act', 'confirm', 'ask', 'waiting', 'done', 'info', 'not-applicable', 'not-included',
]

function countLine(points: readonly DecisionPointView[], isEnglish: boolean): string {
  const counts = new Map<DecisionPointState, number>()
  for (const point of points) counts.set(point.state, (counts.get(point.state) ?? 0) + 1)
  return LEGEND_ORDER
    .filter((state) => counts.get(state))
    .map((state) => `${counts.get(state)} ${stateLabel(state, isEnglish)}`)
    .join(isEnglish ? ', ' : '、')
}

function MapCell({
  point,
  decision,
  inQueue,
  open,
  isEnglish,
  sourceOfPage,
  onOpen,
}: {
  point: DecisionPointView
  decision?: PointDecision
  inQueue: boolean
  open: boolean
  isEnglish: boolean
  sourceOfPage: DecisionPointView['source']
  onOpen: () => void
}) {
  const absent = ABSENT_STATES.has(point.state)
  const check = decision?.record.responseCheck
  // The pack's one sentence for the point leads; its reason is one tap away in
  // the card, and in the cell's title for a pointer.
  const sub = decision
    ? [decision.record.actionLabel ?? decision.action.label, check?.text].filter(Boolean).join(' · ')
    : point.headline ?? point.why
  const title = [point.headline, point.why].filter(Boolean).join(' · ') || undefined
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={open}
      aria-controls={open ? VISIT_DETAIL_ID : undefined}
      className={cn(
        'flex min-h-11 w-full flex-col gap-1 rounded-md border px-2.5 py-2 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        open ? 'border-foreground bg-background' : 'border-border bg-background hover:bg-muted/50',
        absent && !open && 'border-dashed bg-transparent',
        point.state === 'safety' && !decision && 'border-destructive/50',
      )}
      title={title}
      data-dp={point.dp}
      data-state={point.state}
      data-source={point.source}
      data-decided={decision ? 'true' : undefined}
      data-in-queue={inQueue ? 'true' : undefined}
    >
      <span className="flex w-full min-w-0 items-center gap-1.5">
        <span className="shrink-0 font-mono text-[11px] font-semibold text-muted-foreground">{point.dp}</span>
        <span className={cn('min-w-0 flex-1 truncate text-sm font-medium', absent ? 'text-muted-foreground' : 'text-foreground')}>
          {point.label}
        </span>
        {point.source !== sourceOfPage ? (
          <Badge variant="outline" className="h-5 px-1 text-[10px]">{point.source.toUpperCase()}</Badge>
        ) : null}
        <ChainDots chain={point.chain} isEnglish={isEnglish} />
      </span>
      <span className="flex w-full min-w-0 items-center gap-1.5">
        <StatePill state={point.state} isEnglish={isEnglish} decided={Boolean(decision)} inQueue={inQueue} />
        {sub ? <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{sub}</span> : null}
      </span>
    </button>
  )
}

/**
 * 決策地圖: the three sections drawn as three columns — 01 現況, 02 治療,
 * 03 預後與計畫 — each cell one decision point with its chain, its state and
 * one line of the pack's data. Points that do not apply or are not yet
 * computed fold to one line at a column's foot and open with 「顯示全部」;
 * nothing is removed. The shape follows the pack's stage: before a diagnosis
 * only 01 works, in follow-up 01 shrinks to one line, and a column never folds
 * over a point that needs the clinician.
 */
export function DecisionMapColumns({
  model,
  decisionOf,
  queuedDps,
  openKey,
  onOpen,
  isEnglish,
  sourceOfPage,
  answersLine,
  outlookSlot,
  detail,
  columnFooters,
}: {
  model: VisitDecisionModel
  decisionOf: (point: DecisionPointView) => PointDecision | undefined
  queuedDps: ReadonlySet<string>
  openKey: string | null
  onOpen: (point: DecisionPointView) => void
  isEnglish: boolean
  sourceOfPage: DecisionPointView['source']
  /** The every-visit answers in a line, for 01's folded follow-up form. */
  answersLine?: string
  /** Rendered at the foot of 03: the plan, and the prognosis models. */
  outlookSlot?: ReactNode
  /** The opened cell's card, drawn under the columns. */
  detail?: ReactNode
  /** Folded surfaces at the foot of a column (clinical values, rhythm, course, other questions). */
  columnFooters?: Partial<Record<VisitBlock, ReactNode>>
}) {
  const [showAll, setShowAll] = useState(false)
  const statusNeedsClinician = model.points.some((point) => point.block === 'status' && NEEDS_CLINICIAN.has(point.state))
  const [statusOpen, setStatusOpen] = useState(model.stage !== 'follow-up' || statusNeedsClinician)
  const statusFolded = !statusOpen && !statusNeedsClinician

  // A block the pack closed with a note (「確診後開啟」) — or, without one,
  // 02 and 03 before a diagnosis — shows only what needs the clinician.
  const closedNote = (block: VisitBlock): string | undefined => (
    model.blockNotes?.[block]
    ?? (model.stage === 'suspected' && block !== 'status'
      ? (isEnglish ? 'Opens once the diagnosis is confirmed.' : '確診後開啟')
      : undefined)
  )
  const visibleIn = (block: VisitBlock, points: readonly DecisionPointView[]) => {
    if (showAll) return points
    const closed = Boolean(closedNote(block))
    return points.filter((point) => (
      !ABSENT_STATES.has(point.state)
      && (!closed || NEEDS_CLINICIAN.has(point.state))
    ))
  }

  return (
    <section aria-labelledby="cdss-visit-map-title" className="space-y-2" data-testid="cdss-visit-map">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 id="cdss-visit-map-title" className="text-sm font-semibold text-foreground">
          {isEnglish ? 'Decision map' : '決策地圖'}
        </h3>
        <span className="text-xs text-muted-foreground" data-testid="cdss-visit-map-legend">
          {countLine(model.points, isEnglish)}
        </span>
        <button
          type="button"
          className="ml-auto inline-flex h-11 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={showAll}
          onClick={() => setShowAll((value) => !value)}
          data-testid="cdss-visit-map-show-all"
        >
          {showAll
            ? (isEnglish ? 'Fold what does not apply' : '收起不適用與尚未納入')
            : isEnglish
              ? `Show all ${model.coverage.total}`
              : `顯示全部 ${model.coverage.total} 點`}
        </button>
      </div>
      <div className="grid gap-3 @min-[40rem]:grid-cols-3">
        {BLOCK_ORDER.map((block) => {
          const points = model.points.filter((point) => point.block === block)
          const visible = visibleIn(block, points)
          const hidden = points.filter((point) => !visible.includes(point))
          const folded = block === 'status' && statusFolded
          const note = closedNote(block)
          // Subheadings print the pack's group label (A／R／C on the
          // atrial-fibrillation page). Without labels, only the AF page — whose
          // group ids are those letters — shows them; heart-failure ids are not
          // words a clinician reads.
          const labelled = visible.some((point) => point.groupLabel)
          const groups = labelled || model.packId === 'atrial-fibrillation-cdss'
            ? new Set(visible.map((point) => point.group))
            : new Set<string>()
          const titleId = `cdss-visit-col-${block}`
          return (
            <section
              key={block}
              aria-labelledby={titleId}
              className="min-w-0 space-y-1.5 rounded-lg border border-border bg-muted/20 p-2"
              data-testid={`cdss-visit-column-${block}`}
              data-block={block}
              data-folded={folded ? 'true' : undefined}
            >
              <h4 id={titleId} className="px-0.5 text-xs font-semibold text-foreground">
                {blockTitle(block, isEnglish)}
              </h4>
              {note ? (
                <p className="px-0.5 text-xs text-muted-foreground" data-testid={`cdss-visit-column-${block}-closed`}>
                  {note}
                </p>
              ) : null}
              {folded ? (
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2 text-left text-xs text-muted-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-expanded={false}
                  onClick={() => setStatusOpen(true)}
                  data-testid="cdss-visit-status-fold"
                >
                  <span className="min-w-0 flex-1">
                    {answersLine ? <span className="block font-medium text-foreground">{answersLine}</span> : null}
                    <span className="block">{countLine(points, isEnglish)}</span>
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                </button>
              ) : (
                <>
                  {block === 'status' && model.stage === 'follow-up' && !statusNeedsClinician ? (
                    <button
                      type="button"
                      className="inline-flex h-8 items-center gap-1 px-0.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-expanded
                      onClick={() => setStatusOpen(false)}
                    >
                      {isEnglish ? 'Fold to one line' : '收成一行'}
                      <ChevronDown className="h-3.5 w-3.5 rotate-180" aria-hidden="true" />
                    </button>
                  ) : null}
                  <ul className="space-y-1.5">
                    {visible.map((point, index) => {
                      const key = visitDecisionKey(point)
                      const showGroup = groups.size > 1 && (index === 0 || visible[index - 1].group !== point.group)
                      return (
                        <li key={key}>
                          {showGroup ? (
                            <p className="px-0.5 pb-1 pt-1.5 text-[11px] font-semibold text-muted-foreground" data-map-group={point.group}>
                              {point.groupLabel ?? point.group}
                            </p>
                          ) : null}
                          <MapCell
                            point={point}
                            decision={decisionOf(point)}
                            inQueue={queuedDps.has(point.dp)}
                            open={openKey === key}
                            isEnglish={isEnglish}
                            sourceOfPage={sourceOfPage}
                            onOpen={() => onOpen(point)}
                          />
                          {point.checklist?.length && block === 'status' ? (
                            <div className="px-2.5 pb-1 pt-1.5">
                              <DecisionPointChecklist items={point.checklist} isEnglish={isEnglish} compact />
                            </div>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                  {hidden.length ? (
                    <button
                      type="button"
                      className="flex min-h-11 w-full items-center px-0.5 text-left text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-expanded={false}
                      onClick={() => setShowAll(true)}
                      data-testid={`cdss-visit-column-${block}-foot`}
                    >
                      {isEnglish
                        ? `${hidden.length} more folded: ${countLine(hidden, true)} · Show all`
                        : `另 ${hidden.length} 點收起：${countLine(hidden, false)} · 顯示全部`}
                    </button>
                  ) : null}
                </>
              )}
              {columnFooters?.[block]}
              {block === 'outlook' ? outlookSlot : null}
            </section>
          )
        })}
      </div>
      {detail}
    </section>
  )
}
