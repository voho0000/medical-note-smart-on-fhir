"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/src/shared/utils/cn.utils'
import type { PointDecision } from './visit-decisions'
import {
  ABSENT_STATES,
  BLOCK_ORDER,
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
 * Where each block sits in the overview. Narrow, the blocks stack. From 40rem
 * 01 and 03 share the first row and 02 — the longest — takes the full width
 * under them in two columns; from 56rem the three sit side by side, 02 two
 * tracks wide. With a card open on a panel 64rem or wider the overview becomes
 * one column on the left, beside the section, so any other point is one press
 * away without scrolling back (the design the clinician chose on 2026-09-29).
 */
const BLOCK_PLACEMENT: Readonly<Record<VisitBlock, { block: string; rail: string; points: string; railPoints: string }>> = {
  status: { block: '', rail: '', points: '', railPoints: '' },
  treatment: {
    block: '@min-[40rem]:col-span-2 @min-[40rem]:order-last @min-[56rem]:order-none',
    rail: '@min-[64rem]:col-span-1',
    points: '@min-[40rem]:columns-2 @min-[40rem]:gap-2',
    railPoints: '@min-[64rem]:columns-1',
  },
  outlook: { block: '', rail: '', points: '', railPoints: '' },
}

const ATTENTION_ORDER: readonly DecisionPointState[] = ['safety', 'act', 'confirm']

/**
 * One line under a section's name: what in it still needs the clinician and is
 * not already one of its decision rows, then what was recorded today. Points
 * in the rows are counted there, once; points waiting on the every-visit asks
 * are answered in 01. So a section's header says whether opening it adds
 * anything.
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

/** What a search matches in a point: its code, name, group and the pack's words. */
function searchText(point: DecisionPointView): string {
  return [point.dp, point.label, point.groupLabel, point.headline, point.why].filter(Boolean).join(' ').toLowerCase()
}

/** States whose tile carries the pack's sentence on a second line. */
const SENTENCE_STATES: ReadonlySet<DecisionPointState> = new Set(['safety', 'act', 'confirm', 'ask'])

/**
 * A point on the overview, one line: DP code, name and the state's pill. A
 * point that needs the clinician adds the pack's sentence under it, and a
 * point decided today what was decided, so the map stays short enough to
 * read at a glance and still says where the work is. Every point has one, in
 * the pack's order, whatever its state — 不適用 and 尚未納入 included, muted —
 * so a module is always in the same place (clinician feedback 2026-09-29:
 * 「決策地圖點下去還是要看到所有的決策模組」). Pressing it goes straight to
 * the module.
 */
function MapTile({
  point,
  decision,
  inQueue,
  open,
  opensCard,
  matches,
  rail,
  isEnglish,
  sourceOfPage,
  onOpen,
}: {
  point: DecisionPointView
  decision?: PointDecision
  inQueue: boolean
  open: boolean
  /** False for a point the page asks elsewhere (01's 診斷 view): the tile goes there instead. */
  opensCard: boolean
  /** False while a search is typed that this point does not match. */
  matches: boolean
  /** The overview is the column beside an open card: one line per point on a wide panel. */
  rail: boolean
  isEnglish: boolean
  sourceOfPage: DecisionPointView['source']
  onOpen: () => void
}) {
  const absent = ABSENT_STATES.has(point.state)
  const check = decision?.record.responseCheck
  // What was decided on it today, or — where the point needs the clinician —
  // the pack's one sentence for it (a waiting step the queue has moved on to
  // counts). The rest of the pack's words are in the card, and in the tile's
  // title for a pointer.
  const sub = decision
    ? [decision.record.actionLabel ?? decision.action.label, check?.text].filter(Boolean).join(' · ')
    : SENTENCE_STATES.has(point.state) || (inQueue && point.state === 'waiting')
      ? point.headline ?? point.why
      : undefined
  const title = [point.dp, point.label, point.headline, point.why].filter(Boolean).join(' · ')
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={opensCard ? open : undefined}
      aria-controls={open && opensCard ? VISIT_DETAIL_ID : undefined}
      className={cn(
        'flex w-full min-w-0 scroll-mt-2 flex-col justify-center gap-0.5 rounded-md border px-2 py-1 text-left transition-colors motion-reduce:transition-none pointer-coarse:min-h-11',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        absent
          ? 'border-dashed border-border bg-transparent hover:bg-background/60'
          : decision
            ? 'border-border bg-emerald-500/5 hover:bg-emerald-500/10'
            : point.state === 'safety'
              ? 'border-border bg-destructive/5 hover:bg-destructive/10'
              : point.state === 'act'
                ? 'border-border bg-primary/5 hover:bg-primary/10'
                : 'border-border bg-background hover:bg-muted/50',
        open && 'border-primary ring-1 ring-primary',
        !matches && 'opacity-40',
      )}
      title={title}
      data-dp={point.dp}
      data-state={point.state}
      data-source={point.source}
      data-decided={decision ? 'true' : undefined}
      data-in-queue={inQueue ? 'true' : undefined}
      data-match={matches ? undefined : 'false'}
      data-map-tile=""
    >
      <span className="flex w-full min-w-0 items-center gap-1.5">
        <span className="shrink-0 font-mono text-[11px] font-semibold text-muted-foreground">{point.dp}</span>
        <span className={cn('min-w-0 flex-1 truncate text-sm font-medium', absent ? 'text-muted-foreground' : 'text-foreground')}>{point.label}</span>
        {point.source !== sourceOfPage ? (
          <Badge variant="outline" className="h-5 shrink-0 px-1 text-[10px]">{point.source.toUpperCase()}</Badge>
        ) : null}
        <StatePill state={point.state} isEnglish={isEnglish} decided={Boolean(decision)} inQueue={inQueue} />
        {/* Out of sight, the pack's sentence is still read out. */}
        {!sub && (point.headline ?? point.why) ? <span className="sr-only">{point.headline ?? point.why}</span> : null}
      </span>
      {sub ? (
        // Beside an open card the overview is a list of names: the sentence
        // is in the card.
        <span className={cn('flex w-full min-w-0 items-center gap-1.5', rail && '@min-[64rem]:hidden')}>
          <span className="min-w-0 flex-1 truncate text-xs text-foreground/80">{sub}</span>
          <span className="shrink-0">
            <ChainDots chain={point.chain} isEnglish={isEnglish} />
          </span>
        </span>
      ) : null}
    </button>
  )
}

/**
 * Under a card the overview opened: the previous and next point of the map in
 * reading order, and 收合. The last point of a section leads into the next
 * section, so the map reads 01 → 02 → 03 from the card itself.
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
        <button type="button" className={stepClass} onClick={() => onGo(previous)} data-testid="cdss-visit-detail-previous" data-step-dp={previous.dp}>
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
        <button type="button" className={cn(stepClass, 'justify-end text-right')} onClick={() => onGo(next)} data-testid="cdss-visit-detail-next" data-step-dp={next.dp}>
          <span className="sr-only">{isEnglish ? 'Next: ' : '下一個：'}</span>
          <span className="min-w-0 truncate">{where(next)}<span className="font-mono">{next.dp}</span> {next.label}</span>
          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </button>
      ) : <span className="flex-1" />}
    </nav>
  )
}

/**
 * 決策地圖: an overview of every decision point the pack lists, in its three
 * sections — 01 現況, 02 治療, 03 預後與計畫 — side by side, then the open
 * section's working area under it: its questions and today's decision rows
 * (the section's lead), its folded surfaces, and the card of a point opened
 * from the overview.
 *
 * Nothing on the overview folds: a point that does not apply or is not yet
 * computed keeps its place, muted, so a clinician finds a module where it was
 * last time and reaches it in one press (clinician feedback 2026-09-29). A
 * section's name on the overview opens and closes its working area; a point
 * opens its section and its card — under its own row where the lead draws
 * one (a decision row, a pillar), else at the head of the section. The pack
 * decides the points, their order, their words and their states; this
 * component only places them, so every care pack with decision points is
 * drawn the same way.
 */
export function DecisionMapColumns({
  model,
  decisionOf,
  queuedDps,
  openKey,
  onOpen,
  opensCard = () => true,
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
  leadCardKeys,
  initialOpen,
  stepsBeforeNext,
}: {
  model: VisitDecisionModel
  decisionOf: (point: DecisionPointView) => PointDecision | undefined
  queuedDps: ReadonlySet<string>
  openKey: string | null
  onOpen: (point: DecisionPointView) => void
  /**
   * Whether pressing a point opens its card. The page asks some points in
   * its own blocks (01's 診斷 view asks 懷疑 HF？, which stands for DP-00,
   * DP-01 and DP-34); their tiles take the clinician there through `onOpen`
   * rather than opening a card that would ask the same question again.
   */
  opensCard?: (point: DecisionPointView) => boolean
  isEnglish: boolean
  sourceOfPage: DecisionPointView['source']
  /** The every-visit answers in a line, for 01's header. */
  answersLine?: string
  /** The plan in a line (「6 週內密集回診」, 「複驗 K、Cr、血壓，1–2 週內」), for 03's header. */
  outlookSummary?: string
  /** Drawn at the foot of 03: the plan, and the prognosis models. */
  outlookSlot?: ReactNode
  /** The opened point's card. */
  detail?: ReactNode
  /** Folded surfaces at the foot of a section (clinical values, rhythm, course, other questions). */
  columnFooters?: Partial<Record<VisitBlock, ReactNode>>
  /**
   * What a section's working area opens with: its questions and today's
   * decisions in it (01's asks or diagnostic assessment, 02's pillars and
   * rows, 03's rows).
   */
  leads?: Partial<Record<VisitBlock, ReactNode>>
  /** One line per section of what its lead still waits for (「待答 2」, 「待決定 3」). */
  leadSummaries?: Partial<Record<VisitBlock, { text: string; attention: boolean }>>
  /** Points drawn as rows in a lead, so a section's header does not count them twice. */
  rowDps?: ReadonlySet<string>
  /** Points (by decision key) whose card a lead draws under its own row or box. */
  leadCardKeys?: ReadonlySet<string>
  /** The section open at first paint. */
  initialOpen?: VisitBlock | null
  /**
   * A step still inside a section that comes before the next one (01's 追蹤
   * after a diagnosis made on 診斷): its foot button offers it instead of
   * 「下一區」, and the clinician presses it — nothing moves on its own.
   */
  stepsBeforeNext?: Partial<Record<VisitBlock, { label: string; onGo: () => void }>>
}) {
  const [openBlock, setOpenBlock] = useState<VisitBlock | null>(initialOpen ?? null)
  const [query, setQuery] = useState('')
  const searchId = useId()
  // Where to bring the page after a move: the section just opened from 下一區,
  // or the card just opened from a tile or the stepper.
  const scrollTo = useRef<{ block: VisitBlock } | { card: true } | null>(null)
  const openPoint = openKey
    ? model.points.find((point) => visitDecisionKey(point) === openKey)
    : undefined
  // A card is open in its section: on a wide panel the overview becomes the
  // column beside it.
  const cardOpen = Boolean(openPoint && detail && openBlock === openPoint.block)
  // The card's place: under its row where the lead draws one, else at the
  // head of its section.
  const cardAtHead = cardOpen && openPoint && !leadCardKeys?.has(visitDecisionKey(openPoint)) ? openPoint : undefined

  useEffect(() => {
    const target = scrollTo.current
    if (!target) return
    scrollTo.current = null
    if ('block' in target) {
      document.getElementById(`cdss-visit-column-${target.block}`)?.scrollIntoView?.({ block: 'start' })
      return
    }
    // The card has focused its own heading; bring its top into view, under
    // the overview the tile was pressed on.
    document.getElementById(VISIT_DETAIL_ID)?.scrollIntoView?.({ block: 'start' })
  }, [openBlock, openKey])

  // A block the pack closed with a note (「確診後開啟」) — or, without one,
  // 02 and 03 before a diagnosis.
  const closedNote = (block: VisitBlock): string | undefined => (
    model.blockNotes?.[block]
    ?? (model.stage === 'suspected' && block !== 'status'
      ? (isEnglish ? 'Opens once the diagnosis is confirmed.' : '確診後開啟')
      : undefined)
  )
  const pointsOf = (block: VisitBlock) => model.points.filter((point) => point.block === block)
  // The map in reading order, section by section, as the stepper walks it:
  // the points whose card opens at a section's head. A pillar or a decision
  // row decides in its own box and is opened from there.
  const sequence = BLOCK_ORDER.flatMap(pointsOf).filter((point) => opensCard(point) && !leadCardKeys?.has(visitDecisionKey(point)))
  const openIndex = openPoint ? sequence.indexOf(openPoint) : -1
  const needle = query.trim().toLowerCase()
  const matchCount = needle ? model.points.filter((point) => searchText(point).includes(needle)).length : 0

  const open = (point: DecisionPointView) => {
    // The point's card shows in its own section, so that section is the open one.
    if (opensCard(point)) scrollTo.current = { card: true }
    setOpenBlock(point.block)
    // A card left open in a section since closed is out of sight: pressing its
    // point shows it again rather than closing it (#179 review). Only a card
    // in view closes on a second press.
    const hiddenButOpen = openKey === visitDecisionKey(point) && openBlock !== point.block
    if (!hiddenButOpen) onOpen(point)
  }
  const collapse = (point: DecisionPointView) => {
    onOpen(point)
    // Back to the tile that opened it, as the card's own close does.
    requestAnimationFrame(() => {
      const tiles = document.querySelectorAll<HTMLElement>('[data-testid="cdss-visit-map"] button[data-dp]')
      const tile = [...tiles].find((candidate) => candidate.dataset.dp === point.dp && candidate.dataset.source === point.source)
      tile?.focus({ preventScroll: true })
      tile?.scrollIntoView?.({ block: 'nearest' })
    })
  }

  // A section says what its lead still waits for (answers, today's
  // decisions) and what its other points add; 「沒有待辦」 only when neither does.
  const combinedSummary = (block: VisitBlock): { text: string; attention: boolean } => {
    const lead = leadSummaries?.[block]
    const cells = sectionSummary(pointsOf(block).filter((point) => !rowDps?.has(point.dp)), queuedDps, decisionOf, isEnglish)
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

  // One bucket per group, groups in the order they first appear and points in
  // the pack's order within each, under the group's heading when the section
  // has more than one. Headings print the pack's group label; without labels
  // only the AF page — whose group ids are those letters — shows them.
  const bucketsOf = (points: readonly DecisionPointView[]) => {
    const labelled = points.some((point) => point.groupLabel)
    const groups = labelled || model.packId === 'atrial-fibrillation-cdss'
      ? new Set(points.map((point) => point.group))
      : new Set<string>()
    const buckets: { key: string; label?: string; points: DecisionPointView[] }[] = []
    for (const point of points) {
      const key = groups.size > 1 ? point.group : 'all'
      const bucket = buckets.find((candidate) => candidate.key === key)
      if (bucket) bucket.points.push(point)
      else buckets.push({ key, ...(groups.size > 1 ? { label: point.groupLabel ?? point.group } : {}), points: [point] })
    }
    return buckets
  }

  const nextButtonClass = cn(
    styles.tone,
    styles.mapToggle,
    'inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  )

  return (
    <section
      aria-labelledby="cdss-visit-map-title"
      className={cn(
        'space-y-3',
        cardOpen && '@min-[64rem]:grid @min-[64rem]:grid-cols-[17rem_minmax(0,1fr)] @min-[64rem]:items-start @min-[64rem]:gap-3 @min-[64rem]:space-y-0',
      )}
      data-testid="cdss-visit-map"
      data-layout={cardOpen ? 'module' : 'overview'}
    >
      {/* ---------------------------------------------------------- overview */}
      <div
        className={cn(
          'space-y-2',
          cardOpen && '@min-[64rem]:sticky @min-[64rem]:top-2 @min-[64rem]:max-h-[calc(100dvh-1rem)] @min-[64rem]:overflow-y-auto @min-[64rem]:pr-1',
        )}
        data-testid="cdss-visit-overview"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h3 id="cdss-visit-map-title" className="text-sm font-semibold text-foreground">
            {isEnglish ? `Decision map · all ${model.points.length} points` : `決策地圖 · 全部 ${model.points.length} 個決策點`}
          </h3>
          <div className={cn('flex min-w-0 flex-1 items-center justify-end gap-2', cardOpen && '@min-[64rem]:w-full @min-[64rem]:flex-none')}>
            {needle ? (
              <span className="shrink-0 text-xs text-muted-foreground" role="status" data-testid="cdss-visit-map-search-count">
                {isEnglish ? `${matchCount} found` : `找到 ${matchCount} 個`}
              </span>
            ) : null}
            <label
              htmlFor={searchId}
              className={cn(
                'flex h-8 w-full max-w-60 items-center gap-1.5 rounded-md border border-input bg-background px-2 pointer-coarse:h-11',
                'focus-within:ring-2 focus-within:ring-ring',
                cardOpen && '@min-[64rem]:max-w-none',
              )}
            >
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">{isEnglish ? 'Find a point' : '找決策點'}</span>
              <input
                id={searchId}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={isEnglish ? 'Find: MRA, potassium…' : '找：MRA、鉀、抗凝…'}
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                data-testid="cdss-visit-map-search"
              />
            </label>
          </div>
        </div>

        <div
          className={cn(
            'grid items-start gap-2 @min-[40rem]:grid-cols-2 @min-[56rem]:grid-cols-4',
            cardOpen && '@min-[64rem]:grid-cols-1',
          )}
          data-testid="cdss-visit-sections"
        >
          {BLOCK_ORDER.map((block) => {
            const isOpen = openBlock === block
            const note = closedNote(block)
            const summary = combinedSummary(block)
            const extra = block === 'status' ? answersLine : block === 'outlook' ? outlookSummary : undefined
            const placement = BLOCK_PLACEMENT[block]
            const buckets = bucketsOf(pointsOf(block))
            return (
              <div
                key={block}
                className={cn(
                  styles.tone,
                  styles.mapPanel,
                  'min-w-0 overflow-hidden rounded-lg border',
                  placement.block,
                  cardOpen && placement.rail,
                )}
                data-section={SECTION_TONE[block]}
                data-testid={`cdss-visit-overview-${block}`}
              >
                {/* The section's name opens its working area under the overview. */}
                <button
                  type="button"
                  id={`cdss-visit-section-toggle-${block}`}
                  aria-expanded={isOpen}
                  aria-controls={`cdss-visit-column-${block}`}
                  onClick={() => {
                    if (openBlock !== block) scrollTo.current = { block }
                    setOpenBlock((current) => (current === block ? null : block))
                  }}
                  className={cn(
                    styles.mapToggle,
                    'flex w-full min-w-0 items-start gap-2 border-b px-3 py-2 text-left transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                    cardOpen && '@min-[64rem]:py-1.5',
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
                    {extra ? <span className={cn('block truncate text-xs opacity-85', cardOpen && '@min-[64rem]:hidden')}>{extra}</span> : null}
                  </span>
                  <ChevronDown className={cn('mt-0.5 h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none', isOpen && 'rotate-180')} aria-hidden="true" />
                </button>
                <div className={cn('p-1.5', placement.points, cardOpen && placement.railPoints)}>
                  {buckets.map((bucket) => (
                    <div key={bucket.key} className="mb-2 break-inside-avoid space-y-1 last:mb-0">
                      {bucket.label ? (
                        <p className="px-0.5 pt-0.5 text-[11px] font-semibold text-[color:var(--section-ink)]" data-map-group={bucket.key}>
                          {bucket.label}
                        </p>
                      ) : null}
                      <ul className="space-y-1">
                        {bucket.points.map((point) => {
                          const key = visitDecisionKey(point)
                          return (
                            <li key={key} className="min-w-0">
                              <MapTile
                                point={point}
                                decision={decisionOf(point)}
                                inQueue={queuedDps.has(point.dp)}
                                open={openKey === key && cardOpen}
                                opensCard={opensCard(point)}
                                matches={!needle || searchText(point).includes(needle)}
                                rail={cardOpen}
                                isEnglish={isEnglish}
                                sourceOfPage={sourceOfPage}
                                onOpen={() => open(point)}
                              />
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ---------------------------------------------------- working areas */}
      <div className="min-w-0" data-testid="cdss-visit-working">
        {BLOCK_ORDER.map((block) => {
          const nextBlock = BLOCK_ORDER[BLOCK_ORDER.indexOf(block) + 1]
          const note = closedNote(block)
          const isOpen = openBlock === block
          const head = cardAtHead && cardAtHead.block === block ? cardAtHead : undefined
          const headIndex = head ? openIndex : -1
          // A checklist the pack gives a point (DP-02's baseline) stays in
          // view in its section while the point's card is closed.
          const checklists = pointsOf(block).filter((point) => point.checklist?.length && visitDecisionKey(point) !== openKey)
          return (
            <section
              key={block}
              id={`cdss-visit-column-${block}`}
              aria-labelledby={`cdss-visit-section-toggle-${block}`}
              hidden={!isOpen}
              className={cn(styles.tone, styles.mapPanel, 'min-w-0 scroll-mt-2 space-y-2 rounded-lg border border-border p-2 @min-[40rem]:scroll-mt-24')}
              data-section={SECTION_TONE[block]}
              data-testid={`cdss-visit-column-${block}`}
              data-block={block}
              data-open={isOpen ? 'true' : undefined}
            >
              <p className="px-0.5 text-sm font-semibold text-[color:var(--section-ink)]">{blockTitle(block, isEnglish)}</p>
              {note ? (
                <p className="px-0.5 text-xs text-muted-foreground" data-testid={`cdss-visit-column-${block}-closed`}>
                  {note}
                </p>
              ) : null}
              {head ? (
                // The module a tile opened, at the head of its section.
                <div className="space-y-1.5" data-testid="cdss-visit-detail-slot" data-dp={head.dp}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-0.5" data-map-heading="">
                    <span className="font-mono text-[11px] font-semibold text-muted-foreground">{head.dp}</span>
                    <span className="text-sm font-semibold text-foreground">{head.label}</span>
                    {head.source !== sourceOfPage ? (
                      <Badge variant="outline" className="h-5 px-1 text-[10px]">{head.source.toUpperCase()}</Badge>
                    ) : null}
                    <StatePill state={head.state} isEnglish={isEnglish} decided={Boolean(decisionOf(head))} inQueue={queuedDps.has(head.dp)} />
                    {!decisionOf(head) && (head.headline ?? head.why) ? (
                      <span className="basis-full text-sm text-foreground">{head.headline ?? head.why}</span>
                    ) : null}
                  </div>
                  {detail}
                  <DetailStepper
                    current={head}
                    previous={headIndex > 0 ? sequence[headIndex - 1] : undefined}
                    next={headIndex >= 0 && headIndex < sequence.length - 1 ? sequence[headIndex + 1] : undefined}
                    isEnglish={isEnglish}
                    onGo={open}
                    onCollapse={() => collapse(head)}
                  />
                </div>
              ) : null}
              {leads?.[block] ? <div className="space-y-3" data-testid={`cdss-visit-lead-${block}`}>{leads[block]}</div> : null}
              {checklists.map((point) => (
                <div key={visitDecisionKey(point)} className="space-y-1 rounded-md border border-border bg-background px-2.5 py-2" data-testid={`cdss-visit-checklist-${point.dp}`}>
                  <p className="text-[11px] font-semibold text-muted-foreground" data-map-heading="">
                    <span className="font-mono">{point.dp}</span> {point.label}
                  </p>
                  <DecisionPointChecklist items={point.checklist!} isEnglish={isEnglish} compact />
                </div>
              ))}
              {columnFooters?.[block]}
              {block === 'outlook' ? outlookSlot : null}
              {stepsBeforeNext?.[block] ? (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    className={nextButtonClass}
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
                    className={cn(nextButtonClass, closedNote(nextBlock) && 'opacity-70')}
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
      </div>
    </section>
  )
}
