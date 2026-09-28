"use client"

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
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
import styles from '../cdss-poster.module.css'

/** The three-section layout's section each map block is, for its colours. */
const SECTION_TONE: Readonly<Record<VisitBlock, string>> = {
  status: 'diagnosis',
  treatment: 'treatment',
  outlook: 'prognosis',
}

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
        'flex min-h-11 w-full scroll-mt-2 flex-col gap-1 rounded-md border px-2.5 py-2 text-left transition-colors @min-[40rem]:scroll-mt-24',
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
 * Under an open card: the previous and next point of the map in reading order,
 * and 收合. The last point of a section leads into the next section, so the
 * map reads 01 → 02 → 03 without scrolling back up to the section buttons.
 */
function DetailStepper({
  current,
  previous,
  next,
  isEnglish,
  onGo,
  onCollapse,
}: {
  current: DecisionPointView
  previous?: DecisionPointView
  next?: DecisionPointView
  isEnglish: boolean
  onGo: (point: DecisionPointView) => void
  onCollapse: () => void
}) {
  const where = (point: DecisionPointView) => (point.block === current.block ? '' : `${blockTitle(point.block, isEnglish)} · `)
  const stepClass = 'flex min-h-11 min-w-0 flex-1 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  return (
    <nav aria-label={isEnglish ? 'Move through the map' : '在地圖上前後移動'} className="flex items-stretch gap-1.5" data-testid="cdss-visit-detail-stepper">
      {previous ? (
        <button type="button" className={stepClass} onClick={() => onGo(previous)} data-testid="cdss-visit-detail-previous" data-dp={previous.dp}>
          <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="sr-only">{isEnglish ? 'Previous: ' : '上一個：'}</span>
          <span className="min-w-0 truncate">{where(previous)}<span className="font-mono">{previous.dp}</span> {previous.label}</span>
        </button>
      ) : <span className="flex-1" />}
      <button
        type="button"
        className="flex min-h-11 shrink-0 items-center gap-1 rounded-md border border-border bg-background px-3 text-xs transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onCollapse}
        data-testid="cdss-visit-detail-collapse"
      >
        <ChevronUp className="h-4 w-4" aria-hidden="true" />
        {isEnglish ? 'Collapse' : '收合'}
      </button>
      {next ? (
        <button type="button" className={cn(stepClass, 'justify-end text-right')} onClick={() => onGo(next)} data-testid="cdss-visit-detail-next" data-dp={next.dp}>
          <span className="sr-only">{isEnglish ? 'Next: ' : '下一個：'}</span>
          <span className="min-w-0 truncate">{where(next)}<span className="font-mono">{next.dp}</span> {next.label}</span>
          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </button>
      ) : <span className="flex-1" />}
    </nav>
  )
}

const ATTENTION_ORDER: readonly DecisionPointState[] = ['safety', 'act', 'confirm']

/**
 * One line under a section's name: what in it still needs the clinician and is
 * not already in 今天要決定 above, then what was recorded today. Points in the
 * queue are counted there, once; points waiting on the every-visit asks are
 * answered at the top of the screen. So a closed section says whether opening
 * it would add anything.
 */
function sectionSummary(
  points: readonly DecisionPointView[],
  queuedDps: ReadonlySet<string>,
  decisionOf: (point: DecisionPointView) => PointDecision | undefined,
  isEnglish: boolean,
): { text: string; attention: boolean } {
  const decided = points.filter((point) => decisionOf(point)).length
  const open = points.filter((point) => !decisionOf(point) && !queuedDps.has(point.dp))
  const counts = new Map<DecisionPointState, number>()
  for (const point of open) counts.set(point.state, (counts.get(point.state) ?? 0) + 1)
  const attention = ATTENTION_ORDER.filter((state) => counts.get(state))
  const parts = attention.map((state) => `${stateLabel(state, isEnglish)} ${counts.get(state)}`)
  if (decided) parts.push(isEnglish ? `${decided} recorded today` : `已記錄 ${decided}`)
  return {
    text: parts.length ? parts.join(' · ') : (isEnglish ? 'Nothing pending' : '沒有待辦'),
    attention: attention.length > 0,
  }
}

/**
 * 決策地圖: the three sections — 01 現況, 02 治療, 03 預後與計畫 — as three
 * buttons, each with one line of what it holds. A section opens under the
 * buttons when pressed and closes on a second press; opening another closes
 * it. Nothing shows expanded until asked for, so the screen reads as today's
 * decisions first and the map on request.
 *
 * Inside an open section each cell is one decision point with its chain, its
 * state and one line of the pack's data. Points that do not apply or are not
 * yet computed fold to one line at the foot and open with 「顯示全部」; nothing
 * is removed. Closed sections stay in the page, hidden, so their points keep
 * their place; the opened point's card shows in its own section.
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
  outlookSummary,
  outlookSlot,
  detail,
  columnFooters,
  leads,
  leadSummaries,
  rowDps,
  cellFilters,
  initialOpen,
  stepsBeforeNext,
  leadDetailDps,
  showAll: controlledShowAll,
  onShowAllChange,
}: {
  model: VisitDecisionModel
  decisionOf: (point: DecisionPointView) => PointDecision | undefined
  queuedDps: ReadonlySet<string>
  openKey: string | null
  onOpen: (point: DecisionPointView) => void
  isEnglish: boolean
  sourceOfPage: DecisionPointView['source']
  /** The every-visit answers in a line, for 01's summary. */
  answersLine?: string
  /** The plan in a line (「6 週內密集回診」, 「複驗 K、Cr、血壓，1–2 週內」), for 03's summary. */
  outlookSummary?: string
  /** Rendered at the foot of 03: the plan, and the prognosis models. */
  outlookSlot?: ReactNode
  /** The opened cell's card, drawn inside its section. */
  detail?: ReactNode
  /** Folded surfaces at the foot of a section (clinical values, rhythm, course, other questions). */
  columnFooters?: Partial<Record<VisitBlock, ReactNode>>
  /**
   * What a section opens with, above its cells: its questions and today's
   * decisions in it (01's asks or diagnostic assessment, 02's rows). The
   * sections are the page's spine; there is no separate queue above them.
   */
  leads?: Partial<Record<VisitBlock, ReactNode>>
  /** One line per section of what its lead still waits for (「待答 2」, 「待決定 3」). */
  leadSummaries?: Partial<Record<VisitBlock, { text: string; attention: boolean }>>
  /** Points drawn as rows in a lead; not repeated as cells. */
  rowDps?: ReadonlySet<string>
  /** Which of a section's cells show (01's 診斷／追蹤 view). */
  cellFilters?: Partial<Record<VisitBlock, (point: DecisionPointView) => boolean>>
  /** The section open at first paint. */
  initialOpen?: VisitBlock | null
  /**
   * A step still inside a section that comes before the next one (01's 追蹤
   * after a diagnosis made on 診斷): its foot button offers it instead of
   * 「下一區」, and the clinician presses it — nothing moves on its own.
   */
  stepsBeforeNext?: Partial<Record<VisitBlock, { label: string; onGo: () => void }>>
  /** Points whose card a lead draws itself (02's 四支柱), never again at a section's foot. */
  leadDetailDps?: ReadonlySet<string>
  /**
   * 顯示全部, held by the screen so its switch can sit on the status line
   * rather than on a row of its own (clinician feedback 2026-09-28: 「顯示全部
   * 37 點不要自己佔一行」). Without it the map keeps its own.
   */
  showAll?: boolean
  onShowAllChange?: (showAll: boolean) => void
}) {
  const [ownShowAll, setOwnShowAll] = useState(false)
  const showAll = controlledShowAll ?? ownShowAll
  const setShowAll = (next: boolean | ((value: boolean) => boolean)) => {
    const value = typeof next === 'function' ? next(showAll) : next
    if (onShowAllChange) onShowAllChange(value)
    else setOwnShowAll(value)
  }
  const [openBlock, setOpenBlock] = useState<VisitBlock | null>(initialOpen ?? null)
  const [stuck, setStuck] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  // Where to bring the page after a move made from the sticky bar or the
  // stepper: the section just opened, or the cell whose card just opened.
  const scrollTo = useRef<{ block: VisitBlock } | { dp: string; source: string } | null>(null)
  const openPoint = openKey
    ? model.points.find((point) => visitDecisionKey(point) === openKey)
    : undefined
  const openPointBlock = openPoint?.block

  // The bar is stuck once the line just above it has scrolled away; only then
  // does it draw its shadow over the cells passing beneath it.
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting))
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const target = scrollTo.current
    if (!target) return
    scrollTo.current = null
    if ('block' in target) {
      // A section opened from the bar while it was stuck starts right under
      // the bar, not wherever the closed section above left the page.
      const panel = document.getElementById(`cdss-visit-column-${target.block}`)
      const barBottom = barRef.current?.getBoundingClientRect().bottom ?? 0
      if (panel && panel.getBoundingClientRect().top < barBottom) panel.scrollIntoView?.({ block: 'start' })
      return
    }
    const cells = document.querySelectorAll<HTMLElement>('[data-testid="cdss-visit-map"] button[data-dp]')
    ;[...cells].find((cell) => cell.dataset.dp === target.dp && cell.dataset.source === target.source)
      ?.scrollIntoView?.({ block: 'start' })
  }, [openBlock, openKey])

  // A block the pack closed with a note (「確診後開啟」) — or, without one,
  // 02 and 03 before a diagnosis — shows only what needs the clinician.
  const closedNote = (block: VisitBlock): string | undefined => (
    model.blockNotes?.[block]
    ?? (model.stage === 'suspected' && block !== 'status'
      ? (isEnglish ? 'Opens once the diagnosis is confirmed.' : '確診後開啟')
      : undefined)
  )
  // A section's cells: not the points its lead already draws as rows, and —
  // in 01 — only the current view's.
  const cellsOf = (block: VisitBlock) => model.points.filter((point) => (
    point.block === block
    && !rowDps?.has(point.dp)
    && (cellFilters?.[block]?.(point) ?? true)
  ))
  const visibleIn = (block: VisitBlock, points: readonly DecisionPointView[]) => {
    if (showAll) return points
    const closed = Boolean(closedNote(block))
    return points.filter((point) => (
      !ABSENT_STATES.has(point.state)
      && (!closed || NEEDS_CLINICIAN.has(point.state))
    ))
  }
  // The map in reading order, section by section, as the stepper walks it.
  const sequence = BLOCK_ORDER.flatMap((block) => visibleIn(block, cellsOf(block)))
  const openIndex = openPoint ? sequence.indexOf(openPoint) : -1
  const goTo = (point: DecisionPointView) => {
    scrollTo.current = { dp: point.dp, source: point.source }
    setOpenBlock(point.block)
    onOpen(point)
  }
  const collapse = (point: DecisionPointView) => {
    onOpen(point)
    // Back to the cell that opened it, as the card's own close does.
    requestAnimationFrame(() => {
      const cells = document.querySelectorAll<HTMLElement>('[data-testid="cdss-visit-map"] button[data-dp]')
      const cell = [...cells].find((candidate) => candidate.dataset.dp === point.dp && candidate.dataset.source === point.source)
      cell?.focus({ preventScroll: true })
      cell?.scrollIntoView?.({ block: 'nearest' })
    })
  }

  // A section says what its lead still waits for (answers, today's
  // decisions) and what its cells add; 「沒有待辦」 only when neither does.
  const combinedSummary = (block: VisitBlock): { text: string; attention: boolean } => {
    const lead = leadSummaries?.[block]
    const cells = sectionSummary(model.points.filter((point) => point.block === block && !rowDps?.has(point.dp)), queuedDps, decisionOf, isEnglish)
    const nothing = isEnglish ? 'Nothing pending' : '沒有待辦'
    const parts = [lead?.text, cells.text === nothing ? undefined : cells.text].filter(Boolean)
    return {
      text: parts.length ? parts.join(' · ') : nothing,
      attention: Boolean(lead?.attention) || cells.attention,
    }
  }
  const openNext = (block: VisitBlock) => {
    scrollTo.current = { block }
    setOpenBlock(block)
  }

  return (
    <section aria-labelledby="cdss-visit-map-title" className="space-y-2" data-testid="cdss-visit-map">
      {/* The layout switch already names the map; its title is for screen
          readers. 顯示全部 sits on the status line where the screen holds it,
          and only otherwise on a slim row here (clinician feedback
          2026-09-28). */}
      <h3 id="cdss-visit-map-title" className="sr-only">
        {isEnglish ? 'Decision map' : '決策地圖'}
      </h3>
      {onShowAllChange ? null : <div className="-mb-1 flex items-center justify-end">
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:underline pointer-coarse:h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      </div>}
      <div ref={sentinelRef} aria-hidden="true" className="h-px" />
      {/* On a wide screen the three buttons stay at the top of the screen
          while the open section scrolls beneath them, so another section is
          one press away from anywhere in the map. */}
      <div
        ref={barRef}
        className={cn(
          'z-20 -mx-1 grid gap-2 bg-background px-1 py-1 @min-[40rem]:sticky @min-[40rem]:top-0 @min-[40rem]:grid-cols-3',
          stuck && '@min-[40rem]:shadow-[0_8px_10px_-8px_rgb(0_0_0/0.25)]',
        )}
        data-testid="cdss-visit-sections"
        data-stuck={stuck ? 'true' : undefined}
      >
        {BLOCK_ORDER.map((block) => {
          const open = openBlock === block
          const note = closedNote(block)
          const summary = combinedSummary(block)
          const extra = block === 'status' ? answersLine : block === 'outlook' ? outlookSummary : undefined
          return (
            <button
              key={block}
              type="button"
              id={`cdss-visit-section-toggle-${block}`}
              aria-expanded={open}
              aria-controls={`cdss-visit-column-${block}`}
              onClick={() => {
                if (openBlock !== block) scrollTo.current = { block }
                setOpenBlock((current) => (current === block ? null : block))
              }}
              className={cn(
                styles.tone,
                styles.mapToggle,
                'flex min-h-16 w-full min-w-0 items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              )}
              data-section={SECTION_TONE[block]}
              data-testid={`cdss-visit-section-toggle-${block}`}
              data-attention={summary.attention ? 'true' : undefined}
            >
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className="block text-sm font-semibold">{blockTitle(block, isEnglish)}</span>
                <span className={cn('block text-xs', summary.attention ? 'font-semibold' : 'opacity-85')}>
                  {note ?? summary.text}
                </span>
                {extra ? <span className="block truncate text-xs opacity-85">{extra}</span> : null}
              </span>
              <ChevronDown className={cn('mt-0.5 h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden="true" />
            </button>
          )
        })}
      </div>
      {BLOCK_ORDER.map((block) => {
        const points = cellsOf(block)
        const visible = visibleIn(block, points)
        const hidden = points.filter((point) => !visible.includes(point))
        const nextBlock = BLOCK_ORDER[BLOCK_ORDER.indexOf(block) + 1]
        const note = closedNote(block)
        const open = openBlock === block
        // Subheadings print the pack's group label (A／R／C on the
        // atrial-fibrillation page). Without labels, only the AF page — whose
        // group ids are those letters — shows them; heart-failure ids are not
        // words a clinician reads.
        const labelled = visible.some((point) => point.groupLabel)
        const groups = labelled || model.packId === 'atrial-fibrillation-cdss'
          ? new Set(visible.map((point) => point.group))
          : new Set<string>()
        // One bucket per group, groups in the order they first appear and
        // points in the pack's order within each, with the group's heading when
        // the section has more than one. A group whose points the pack does not
        // list side by side (用藥安全: DP-25 before the pillars, DP-05 after) is
        // still one group under one heading.
        const buckets: { key: string; label?: string; points: DecisionPointView[] }[] = []
        for (const point of visible) {
          const key = groups.size > 1 ? point.group : 'all'
          const bucket = buckets.find((candidate) => candidate.key === key)
          if (bucket) bucket.points.push(point)
          else buckets.push({ key, ...(groups.size > 1 ? { label: point.groupLabel ?? point.group } : {}), points: [point] })
        }
        return (
          <section
            key={block}
            id={`cdss-visit-column-${block}`}
            aria-labelledby={`cdss-visit-section-toggle-${block}`}
            hidden={!open}
            className={cn(styles.tone, styles.mapPanel, 'min-w-0 scroll-mt-2 space-y-2 rounded-lg border border-border p-2 @min-[40rem]:scroll-mt-24')}
            data-section={SECTION_TONE[block]}
            data-testid={`cdss-visit-column-${block}`}
            data-block={block}
            data-open={open ? 'true' : undefined}
          >
            {note ? (
              <p className="px-0.5 text-xs text-muted-foreground" data-testid={`cdss-visit-column-${block}-closed`}>
                {note}
              </p>
            ) : null}
            {leads?.[block] ? <div className="space-y-3" data-testid={`cdss-visit-lead-${block}`}>{leads[block]}</div> : null}
            {leads?.[block] && buckets.length ? (
              <p className="px-0.5 pt-1 text-[11px] font-semibold text-muted-foreground">
                {isEnglish ? 'Other points' : `${blockTitle(block, isEnglish).split(' ')[0]} 其餘`}
              </p>
            ) : null}
            {/* Each group is its own grid: a card's detail opens as a full row
                under it and the next card of the same group fills the place
                beside it (dense flow), but a gap at the end of one group is
                never filled by a card from the next. */}
            {buckets.map((bucket) => (
              <div key={bucket.key} className="space-y-1.5">
                {bucket.label ? (
                  <p className="px-0.5 pt-1.5 text-[11px] font-semibold text-muted-foreground" data-map-group={bucket.key}>
                    {bucket.label}
                  </p>
                ) : null}
                <ul className="grid grid-flow-dense gap-1.5 @min-[40rem]:grid-cols-2 @min-[56rem]:grid-cols-3">
                  {bucket.points.flatMap((point) => {
                    const key = visitDecisionKey(point)
                    const item = (
                      <li key={key} className="min-w-0">
                        <MapCell
                          point={point}
                          decision={decisionOf(point)}
                          inQueue={queuedDps.has(point.dp)}
                          open={openKey === key}
                          isEnglish={isEnglish}
                          sourceOfPage={sourceOfPage}
                          onOpen={() => {
                            // The point's card shows in its own section, so that section is the open one.
                            setOpenBlock(block)
                            onOpen(point)
                          }}
                        />
                        {point.checklist?.length && block === 'status' ? (
                          <div className="px-2.5 pb-1 pt-1.5">
                            <DecisionPointChecklist items={point.checklist} isEnglish={isEnglish} compact />
                          </div>
                        ) : null}
                      </li>
                    )
                    // The opened point's card sits directly under the cell that
                    // opened it, not at the foot of the section.
                    const opened = openKey === key && open && detail ? (
                      <li key={`${key}-detail`} className="col-span-full space-y-1.5" data-testid="cdss-visit-detail-slot">
                        {detail}
                        <DetailStepper
                          current={point}
                          previous={openIndex > 0 ? sequence[openIndex - 1] : undefined}
                          next={openIndex >= 0 && openIndex < sequence.length - 1 ? sequence[openIndex + 1] : undefined}
                          isEnglish={isEnglish}
                          onGo={goTo}
                          onCollapse={() => collapse(point)}
                        />
                      </li>
                    ) : null
                    return opened ? [item, opened] : [item]
                  })}
                </ul>
              </div>
            ))}
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
            {/* A point hidden by the fold (opened before 顯示全部 was turned
                off) still shows its card, at the foot. */}
            {open && openPointBlock === block && openPoint && !rowDps?.has(openPoint.dp) && !leadDetailDps?.has(openPoint.dp) && !visible.some((point) => visitDecisionKey(point) === openKey) ? detail : null}
            {columnFooters?.[block]}
            {block === 'outlook' ? outlookSlot : null}
            {stepsBeforeNext?.[block] ? (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  className={cn(
                    styles.tone,
                    styles.mapToggle,
                    'inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  )}
                  data-section={SECTION_TONE[block]}
                  onClick={stepsBeforeNext[block]!.onGo}
                  data-testid={`cdss-visit-next-step-${block}`}
                >
                  {stepsBeforeNext[block]!.label}
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ) : nextBlock ? (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  className={cn(
                    styles.tone,
                    styles.mapToggle,
                    'inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    closedNote(nextBlock) && 'opacity-70',
                  )}
                  data-section={SECTION_TONE[nextBlock]}
                  disabled={Boolean(closedNote(nextBlock))}
                  onClick={() => openNext(nextBlock)}
                  data-testid={`cdss-visit-next-${block}`}
                >
                  {closedNote(nextBlock)
                    ? `${blockTitle(nextBlock, isEnglish)}${isEnglish ? ': ' : '：'}${closedNote(nextBlock)}`
                    : `${isEnglish ? 'Next: ' : '下一區：'}${blockTitle(nextBlock, isEnglish)} · ${combinedSummary(nextBlock).text}`}
                  {closedNote(nextBlock) ? null : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            ) : null}
          </section>
        )
      })}
    </section>
  )
}
