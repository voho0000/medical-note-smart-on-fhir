"use client"

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ClipboardCopy, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/src/shared/utils/cn.utils'
import type { PointDecision } from './visit-decisions'
import {
  ABSENT_STATES,
  BLOCK_ORDER,
  blockShortTitle,
  blockTitle,
  sourceTag,
  stateLabel,
  visitDecisionKey,
} from './visit-decisions'
import type { DecisionPointState, DecisionPointView, VisitBlock, VisitDecisionModel } from '../../types'
import { ChainDots, StatePill } from './visit-presentation'
import { DecisionPointChecklist, VISIT_DETAIL_ID } from './DecisionPointDetail'
import styles from '../cdss-poster.module.css'
import { focusBackTo, revealTop, scrollParentOf } from './reveal'

/** The three-section layout's section each map block is, for its colours. */
const SECTION_TONE: Readonly<Record<VisitBlock, string>> = {
  status: 'diagnosis',
  treatment: 'treatment',
  outlook: 'prognosis',
}

/**
 * From this width (in rem, the map's own) every decision point is a column on
 * the left and what a press opens is on the right, beside it (clinician
 * feedback 2026-09-29: 「左邊是一整排 DP，右邊是細項，細項不用太寬」) — so an
 * even split of a 1280 screen already has it. The column is 13.5rem, 15rem
 * from 48rem, 17rem from 64rem and 20rem from 80rem, where names no longer
 * need cutting; the details are never much narrower than a phone's screen,
 * which they are laid out for. Narrower, the map stacks over the details.
 */
const SIDE_BY_SIDE_REM = 36

/**
 * Whether the map is wide enough to stand beside its details, and how tall the
 * column may be to stay whole in view as the details scroll. The layout itself
 * is container queries; this is for what the layout cannot say — a section
 * name pressed beside the details keeps them, rather than leaving the right
 * side empty.
 */
function useSideBySide(ref: RefObject<HTMLElement | null>): { sideBySide: boolean; columnHeight?: number } {
  const [state, setState] = useState<{ sideBySide: boolean; columnHeight?: number }>({ sideBySide: false })
  // Before paint, so the first frame is already laid out as it will stay.
  useLayoutEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => measure())
    let scroller: HTMLElement | undefined
    const measure = () => {
      // Found again each time: what scrolls can change once the panel's own
      // effects have run.
      const found = scrollParentOf(element)
      if (found !== scroller) {
        if (scroller) observer.unobserve(scroller)
        if (found) observer.observe(found)
        scroller = found
      }
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      const sideBySide = element.getBoundingClientRect().width >= SIDE_BY_SIDE_REM * rem
      // The column sits 0.5rem from the top of what scrolls and keeps 0.5rem below.
      const columnHeight = sideBySide ? Math.max(0, Math.floor((scroller?.clientHeight ?? window.innerHeight) - rem)) : undefined
      setState((current) => (current.sideBySide === sideBySide && current.columnHeight === columnHeight
        ? current
        : { sideBySide, ...(columnHeight === undefined ? {} : { columnHeight }) }))
    }
    observer.observe(element)
    measure()
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [ref])
  return state
}

/**
 * How far below the top of what scrolls the steps, stuck at the head of the
 * details, reach — as `--cdss-steps-clear` on the details, which every place
 * the map moves the page to keeps as its scroll margin. Measured, not a fixed
 * rem: the steps' text is set in pixels and the page's rem is not always 16,
 * so a guess leaves a target's top — the summary's 複製 — under them.
 */
function useStepsClearance(
  workingRef: RefObject<HTMLElement | null>,
  stepsRef: RefObject<HTMLElement | null>,
): void {
  useLayoutEffect(() => {
    const working = workingRef.current
    const steps = stepsRef.current
    if (!working || !steps || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const style = getComputedStyle(steps)
      // Stacked on a very narrow panel the steps scroll away with the rest.
      const stuck = style.position === 'sticky'
      // A stuck offset counts from inside what scrolls' padding; a scroll
      // margin from its edge.
      const scroller = scrollParentOf(steps)
      const padding = scroller ? Number.parseFloat(getComputedStyle(scroller).paddingTop) || 0 : 0
      const clear = stuck ? padding + (Number.parseFloat(style.top) || 0) + steps.getBoundingClientRect().height + 6 : 8
      working.style.setProperty('--cdss-steps-clear', `${Math.ceil(clear)}px`)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(steps)
    observer.observe(working)
    return () => observer.disconnect()
  }, [workingRef, stepsRef])
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
  pending,
  open,
  opensCard,
  matches,
  isEnglish,
  sourceOfPage,
  onOpen,
}: {
  point: DecisionPointView
  decision?: PointDecision
  inQueue: boolean
  /** The question another row's step now asks for it (DP-09's 「選 DOAC」), over its own 「等 DP-07」. */
  pending?: string
  open: boolean
  /** False for a point the page asks elsewhere (01's 診斷 view): the tile goes there instead. */
  opensCard: boolean
  /** False while a search is typed that this point does not match. */
  matches: boolean
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
  const sentence = pending ?? point.headline ?? point.why
  const sub = decision
    ? [decision.record.actionLabel ?? decision.action.label, check?.text].filter(Boolean).join(' · ')
    : SENTENCE_STATES.has(point.state) || (inQueue && point.state === 'waiting')
      ? sentence
      : undefined
  const title = [point.dp, point.label, pending ?? point.headline, point.why].filter(Boolean).join(' · ')
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
          <Badge variant="outline" className="h-5 shrink-0 px-1 text-[10px]">{sourceTag(point)}</Badge>
        ) : null}
        <StatePill state={point.state} isEnglish={isEnglish} decided={Boolean(decision)} inQueue={inQueue} />
        {/* Out of sight, the pack's sentence is still read out. */}
        {!sub && sentence ? <span className="sr-only">{sentence}</span> : null}
      </span>
      {sub ? (
        <span className="flex w-full min-w-0 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-xs text-foreground/80">{sub}</span>
          <span className="shrink-0">
            <ChainDots chain={point.chain} isEnglish={isEnglish} />
          </span>
        </span>
      ) : null}
    </button>
  )
}

/** Where the working area is: one of the three sections, or the visit's summary. */
type VisitStep = VisitBlock | 'summary'

/**
 * The visit's steps at the head of the working area — 01 現況, 02 治療, 03
 * 預後與計畫, then 本次摘要 — each saying what it still needs, so where the
 * clinician is and what is left are always in view, and any step is one press
 * away. A section the pack has closed (「確診後開啟」) says so and does not open.
 */
function VisitSteps({
  shown,
  summaries,
  closedNote,
  summaryStatus,
  isEnglish,
  onGo,
}: {
  shown: VisitStep | null
  summaries: Readonly<Record<VisitBlock, { text: string; attention: boolean; nothing: boolean }>>
  closedNote: (block: VisitBlock) => string | undefined
  /** What the summary holds so far (「已記錄 2」); absent when the screen has no summary. */
  summaryStatus?: string
  isEnglish: boolean
  onGo: (step: VisitStep) => void
}) {
  const stepClass = cn(
    styles.tone,
    styles.mapToggle,
    'flex h-full min-h-11 w-full min-w-0 flex-col items-start justify-center gap-0.5 rounded-md border px-2 py-1 text-left transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-disabled:cursor-not-allowed aria-disabled:opacity-60',
  )
  return (
    <nav aria-label={isEnglish ? 'This visit, step by step' : '本次看診的步驟'} data-testid="cdss-visit-steps">
      <ol className={cn('grid gap-1', summaryStatus === undefined ? 'grid-cols-3' : 'grid-cols-4')}>
        {BLOCK_ORDER.map((block) => {
          const note = closedNote(block)
          const summary = summaries[block]
          return (
            <li key={block} className="min-w-0">
              <button
                type="button"
                className={stepClass}
                data-section={SECTION_TONE[block]}
                aria-current={shown === block ? 'step' : undefined}
                // Closed, it still takes focus and reads its reason (「確診後開啟」).
                aria-disabled={note ? true : undefined}
                title={`${blockTitle(block, isEnglish)} · ${note ?? summary.text}`}
                onClick={() => { if (!note) onGo(block) }}
                data-testid={`cdss-visit-step-${block}`}
                data-attention={summary.attention && !note ? 'true' : undefined}
              >
                <span className="block max-w-full truncate text-[13px] font-semibold">{blockShortTitle(block, isEnglish)}</span>
                <span className={cn('flex max-w-full items-center gap-1 text-[11px] leading-4', summary.attention && !note ? 'font-semibold' : 'opacity-85')}>
                  {!note && summary.nothing ? <Check className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
                  <span className="truncate">{note ?? summary.text}</span>
                </span>
              </button>
            </li>
          )
        })}
        {summaryStatus !== undefined ? (
          <li className="min-w-0">
            <button
              type="button"
              className={stepClass}
              data-section="summary"
              aria-current={shown === 'summary' ? 'step' : undefined}
              onClick={() => onGo('summary')}
              data-testid="cdss-visit-step-summary"
            >
              <span className="flex max-w-full items-center gap-1 text-[13px] font-semibold">
                <ClipboardCopy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{isEnglish ? 'Summary' : '本次摘要'}</span>
              </span>
              <span className="block max-w-full truncate text-[11px] leading-4 text-muted-foreground">{summaryStatus}</span>
            </button>
          </li>
        ) : null}
      </ol>
    </nav>
  )
}

/**
 * A point its section still needs the clinician for, beyond what the section
 * draws: its name, state and the pack's sentence, one press to its card.
 */
function StillOpenRow({
  point,
  isEnglish,
  sourceOfPage,
  onOpen,
}: {
  point: DecisionPointView
  isEnglish: boolean
  sourceOfPage: DecisionPointView['source']
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md border border-border px-2 py-1.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-still-open={point.dp}
      data-source={point.source}
    >
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 font-mono text-[11px] font-semibold text-muted-foreground">{point.dp}</span>
          <span className="min-w-0 truncate text-sm font-medium text-foreground">{point.label}</span>
          {point.source !== sourceOfPage ? (
            <Badge variant="outline" className="h-5 shrink-0 px-1 text-[10px]">{sourceTag(point)}</Badge>
          ) : null}
          <StatePill state={point.state} isEnglish={isEnglish} decided={false} inQueue={false} />
        </span>
        {point.headline ?? point.why ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">{point.headline ?? point.why}</span>
        ) : null}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
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
 * sections — 01 現況, 02 治療, 03 預後與計畫 — and the open section's working
 * area: its questions and today's decision rows (the section's lead), its
 * folded surfaces, and the card of a point opened from the overview. From
 * 36rem the overview is a column on the left that stays in view and the
 * working area is beside it; narrower, the overview stacks over it.
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
  pendingLine,
  summary,
  asks,
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
  /**
   * The line over a card at a section's head, where another row's step now
   * asks it (DP-09's 「選 DOAC」 on DP-07's row) rather than the point's own
   * 「等上一步」.
   */
  pendingLine?: (point: DecisionPointView) => string | undefined
  /**
   * The visit's summary — its text and 複製 — as the last step after 03, with
   * a line of what it holds so far for the step's name.
   */
  summary?: { content: ReactNode; status: string }
  /**
   * The every-visit questions, carried to the head of 02 and 03 while any is
   * unanswered: their answers decide points there (DP-06's diuretic waits on
   * 喘／體重), and the clinician answers where they are rather than going back
   * to 01. Answered there, they stay — marked done — until the clinician
   * leaves the step, so the button just pressed is not pulled from under them.
   */
  asks?: {
    content: ReactNode
    pending: boolean
    /** An answer opened more to ask in 01 (喘變差 opens the fuller questions there). */
    opensMore?: boolean
  }
}) {
  const [openBlock, setOpenBlock] = useState<VisitStep | null>(initialOpen ?? null)
  const [query, setQuery] = useState('')
  // Narrow, the map's list folds under its title: the steps at the head of
  // the details say what each section needs, and 37 rows above the details
  // would put every step a long scroll away. A search unfolds it.
  const [mapUnfolded, setMapUnfolded] = useState(false)
  const mapRef = useRef<HTMLElement | null>(null)
  const { sideBySide, columnHeight } = useSideBySide(mapRef)
  const workingRef = useRef<HTMLDivElement | null>(null)
  const stepsRef = useRef<HTMLDivElement | null>(null)
  useStepsClearance(workingRef, stepsRef)
  // Beside the column the details are never empty: a section — or the
  // summary — is always shown.
  const summaryShown = openBlock === 'summary' && Boolean(summary)
  const shownBlock: VisitBlock | null = openBlock === 'summary' && summary
    ? null
    : (openBlock === 'summary' ? null : openBlock) ?? (sideBySide ? 'status' : null)
  const shownStep: VisitStep | null = summaryShown ? 'summary' : shownBlock
  // The step the every-visit questions were carried into, held while the
  // clinician stays there (state adjusted during render, as React advises for
  // state that follows props).
  const asksStep = shownBlock && shownBlock !== 'status' ? shownBlock : null
  const [asksHeldIn, setAsksHeldIn] = useState<VisitBlock | null>(null)
  if (asks?.pending && asksStep && asksHeldIn !== asksStep) setAsksHeldIn(asksStep)
  if (!asks?.pending && asksHeldIn && asksHeldIn !== asksStep) setAsksHeldIn(null)
  const asksIn = asks?.pending ? asksStep : asksHeldIn && asksHeldIn === asksStep ? asksStep : null
  const searchId = useId()
  // Where to bring the page after a move: the section just opened from 下一區,
  // or the card just opened from a tile or the stepper. State, not a ref: each
  // press is a new request, so one that changes nothing else (the step
  // already shown) still moves the page, and none is left behind for a later,
  // unrelated render.
  const [reveal, setReveal] = useState<{ block: VisitStep; focus: boolean } | { card: true } | null>(null)
  const openPoint = openKey
    ? model.points.find((point) => visitDecisionKey(point) === openKey)
    : undefined
  // A card is open in its section.
  const cardOpen = Boolean(openPoint && detail && shownBlock === openPoint.block)
  // The card's place: under its row where the lead draws one, else at the
  // head of its section.
  const cardAtHead = cardOpen && openPoint && !leadCardKeys?.has(visitDecisionKey(openPoint)) ? openPoint : undefined

  useEffect(() => {
    if (!reveal) return
    if ('block' in reveal) {
      if (reveal.focus) document.getElementById(`cdss-visit-column-${reveal.block}-title`)?.focus({ preventScroll: true })
      revealTop(document.getElementById(`cdss-visit-column-${reveal.block}`))
      return
    }
    // The card has focused its own heading; bring its top into view — under
    // the overview the tile was pressed on, or beside the column — with the
    // point's line above it where it opened at its section's head.
    revealTop(document.querySelector('[data-testid="cdss-visit-detail-slot"]') ?? document.getElementById(VISIT_DETAIL_ID))
  }, [reveal])

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
    // A point picked from the unfolded list: the list folds again, and the
    // details come up to meet the clinician.
    if (!sideBySide) setMapUnfolded(false)
    // The point's card shows in its own section, so that section is the open one.
    if (opensCard(point)) setReveal({ card: true })
    setOpenBlock(point.block)
    // A card left open in a section since closed is out of sight: pressing its
    // point shows it again rather than closing it (#179 review). Only a card
    // in view closes on a second press.
    const hiddenButOpen = openKey === visitDecisionKey(point) && shownBlock !== point.block
    if (!hiddenButOpen) onOpen(point)
  }
  const collapse = (point: DecisionPointView) => {
    onOpen(point)
    // Back to what opened it, as the card's own close does — or, with the
    // list folded away, somewhere still on the page.
    requestAnimationFrame(() => focusBackTo(point))
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
  // `focus`: the press came from inside what it hides (a foot button, the
  // carried questions), so focus follows to the heading of what it shows.
  const openNext = (step: VisitStep, focus = false) => {
    setReveal({ block: step, focus })
    setOpenBlock(step)
  }
  // A step, a section's name, 下一區／完成 or the way back to 01 shows the
  // section itself: a card standing for it closes (the card is the section
  // while it is open) — shown now or left open there before the clinician
  // moved on, which would come back as the section and hide what the press
  // was for (#194 review: DP-24 → 02 → 01 showed only DP-24). A tile pressed
  // for a card still opens it.
  const showStep = (step: VisitStep, focus = false) => {
    const left = openPoint && detail && opensCard(openPoint) && !leadCardKeys?.has(visitDecisionKey(openPoint)) ? openPoint : undefined
    if (left && left.block === step) onOpen(left)
    openNext(step, focus)
  }
  const nothingText = isEnglish ? 'Nothing pending' : '沒有待辦'
  const stepSummaries = Object.fromEntries(BLOCK_ORDER.map((block) => {
    const combined = combinedSummary(block)
    return [block, { ...combined, nothing: combined.text === nothingText }]
  })) as Record<VisitBlock, { text: string; attention: boolean; nothing: boolean }>
  // The open sections still asking for something, for the summary's foot-note.
  const summaryLeft = BLOCK_ORDER.filter((block) => !closedNote(block) && stepSummaries[block].attention)

  // One bucket per group, groups in the order they first appear and points in
  // the pack's order within each, under the group's heading when the section
  // has more than one. Headings print the pack's group label, which every
  // point carries; points without one (a hand-built model) draw no headings.
  const bucketsOf = (points: readonly DecisionPointView[]) => {
    const labelled = points.some((point) => point.groupLabel)
    const groups = labelled
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
      ref={mapRef}
      aria-labelledby="cdss-visit-map-title"
      className="@container"
      data-testid="cdss-visit-map"
      data-layout={sideBySide ? 'side-by-side' : cardOpen ? 'module' : 'overview'}
    >
      {/* Narrow, the map stacks over the details; from 36rem it is the
          column on the left, and the details are beside it. */}
      <div className="space-y-3 @min-[36rem]:grid @min-[36rem]:grid-cols-[13.5rem_minmax(0,1fr)] @min-[36rem]:items-start @min-[36rem]:gap-3 @min-[36rem]:space-y-0 @min-[48rem]:grid-cols-[15rem_minmax(0,1fr)] @min-[64rem]:grid-cols-[17rem_minmax(0,1fr)] @min-[80rem]:grid-cols-[20rem_minmax(0,1fr)]">
      {/* ---------------------------------------------------------- overview */}
      <div
        // The height is measured; whether it applies is the container query's
        // to say, so the stacked map never takes a column's height.
        className="space-y-2 @min-[36rem]:sticky @min-[36rem]:top-2 @min-[36rem]:max-h-(--cdss-column-height) @min-[36rem]:overflow-y-auto @min-[36rem]:overscroll-contain @min-[36rem]:pr-1"
        style={columnHeight ? { '--cdss-column-height': `${columnHeight}px` } as CSSProperties : undefined}
        data-testid="cdss-visit-overview"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h3 id="cdss-visit-map-title" className="text-sm font-semibold text-foreground">
            {isEnglish ? `Decision map · all ${model.points.length} points` : `決策地圖 · 全部 ${model.points.length} 個決策點`}
          </h3>
          {needle ? null : (
            <button
              type="button"
              aria-expanded={mapUnfolded}
              aria-controls="cdss-visit-sections"
              onClick={() => setMapUnfolded(!mapUnfolded)}
              className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11 @min-[36rem]:hidden"
              data-testid="cdss-visit-map-fold"
            >
              {mapUnfolded ? (isEnglish ? 'Fold' : '收起') : (isEnglish ? 'Show all' : '展開')}
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform motion-reduce:transition-none', mapUnfolded && 'rotate-180')} aria-hidden="true" />
            </button>
          )}
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 @min-[36rem]:w-full @min-[36rem]:flex-none">
            {needle ? (
              <span className="shrink-0 text-xs text-muted-foreground" role="status" data-testid="cdss-visit-map-search-count">
                {isEnglish ? `${matchCount} found` : `找到 ${matchCount} 個`}
              </span>
            ) : null}
            <label
              htmlFor={searchId}
              className={cn(
                'flex h-8 w-full max-w-60 items-center gap-1.5 rounded-md border border-input bg-background px-2 pointer-coarse:h-11 @min-[36rem]:max-w-none',
                'focus-within:ring-2 focus-within:ring-ring',
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
          id="cdss-visit-sections"
          className={cn('grid items-start gap-2', !mapUnfolded && !needle && '@max-[36rem]:hidden')}
          data-testid="cdss-visit-sections"
          data-folded={!sideBySide && !mapUnfolded && !needle ? 'true' : undefined}
        >
          {BLOCK_ORDER.map((block) => {
            const isOpen = shownBlock === block
            const note = closedNote(block)
            const summary = combinedSummary(block)
            const extra = block === 'status' ? answersLine : block === 'outlook' ? outlookSummary : undefined
            const buckets = bucketsOf(pointsOf(block))
            return (
              <div
                key={block}
                className={cn(styles.tone, styles.mapPanel, 'min-w-0 overflow-hidden rounded-lg border')}
                data-section={SECTION_TONE[block]}
                data-testid={`cdss-visit-overview-${block}`}
              >
                {/* The section's name opens its working area — under the
                    overview, or beside it, where it stays open: there the
                    details are never left empty. */}
                <button
                  type="button"
                  id={`cdss-visit-section-toggle-${block}`}
                  // Beside the details a name shows its section and never
                  // folds it: the one shown is current, not expanded.
                  aria-expanded={sideBySide ? undefined : isOpen}
                  aria-current={sideBySide && isOpen ? 'true' : undefined}
                  aria-controls={`cdss-visit-column-${block}`}
                  onClick={() => {
                    if (sideBySide || !isOpen || cardAtHead?.block === block) showStep(block)
                    else setOpenBlock(null)
                  }}
                  className={cn(
                    styles.mapToggle,
                    'flex w-full min-w-0 items-start gap-2 border-b px-3 py-2 text-left transition-colors @min-[36rem]:py-1.5',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
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
                    {/* Beside the details the column is a list of points; the answers are in 01 itself. */}
                    {extra ? <span className="block truncate text-xs opacity-85 @min-[36rem]:hidden">{extra}</span> : null}
                  </span>
                  <ChevronDown className={cn('mt-0.5 h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none @min-[36rem]:-rotate-90', isOpen && 'rotate-180 @min-[36rem]:rotate-0')} aria-hidden="true" />
                </button>
                <div className="p-1.5">
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
                                {...(pendingLine?.(point) ? { pending: pendingLine(point) } : {})}
                                open={openKey === key && cardOpen}
                                opensCard={opensCard(point)}
                                matches={!needle || searchText(point).includes(needle)}
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
      {/* Its own container: what it holds lays out for the width it has
          beside the column, not for the whole panel's. */}
      {/* Whatever in the details the page is moved to — by the map, or by
          the page's own surfaces (「下一步：追蹤」, the fuller questions) —
          lands below the steps: every element keeps their reach as its
          scroll margin. */}
      <div ref={workingRef} className="@container min-w-0 space-y-2 [&_*]:scroll-mt-[var(--cdss-steps-clear,0.5rem)]" data-testid="cdss-visit-working">
        {/* Where the visit is, and what each step still needs: in view at the
            head of the details as they scroll. */}
        <div ref={stepsRef} className="z-10 bg-background/95 py-0.5 backdrop-blur-sm @min-[20rem]:sticky @min-[20rem]:top-2">
          <VisitSteps
            shown={shownStep}
            summaries={stepSummaries}
            closedNote={closedNote}
            {...(summary ? { summaryStatus: summary.status } : {})}
            isEnglish={isEnglish}
            onGo={showStep}
          />
        </div>
        {BLOCK_ORDER.map((block) => {
          const nextBlock = BLOCK_ORDER[BLOCK_ORDER.indexOf(block) + 1]
          const note = closedNote(block)
          const isOpen = shownBlock === block
          const head = cardAtHead && cardAtHead.block === block ? cardAtHead : undefined
          const headIndex = head ? openIndex : -1
          // A checklist the pack gives a point (DP-02's baseline) stays in
          // view in its section while the point's card is closed.
          const checklists = pointsOf(block).filter((point) => point.checklist?.length && visitDecisionKey(point) !== openKey)
          // What the step counts for this section beyond its decision rows
          // (DP-31's 「BMI 32.8：semaglutide／tirzepatide？」, DP-32's 衛教), one
          // press each: the section holds all it asks for, with the map
          // folded away on a phone as beside it.
          const stillOpen = pointsOf(block).filter((point) => ATTENTION_ORDER.includes(point.state)
            && !decisionOf(point)
            && !queuedDps.has(point.dp)
            && !rowDps?.has(point.dp)
            // A pillar's row is its own (the pillar box draws it).
            && !leadCardKeys?.has(visitDecisionKey(point))
            && visitDecisionKey(point) !== openKey)
          // A point with its checklist box above is opened from the box.
          const stillOpenListed = stillOpen.filter((point) => !checklists.includes(point))
          return (
            <section
              key={block}
              id={`cdss-visit-column-${block}`}
              aria-labelledby={`cdss-visit-section-toggle-${block}`}
              hidden={!isOpen}
              className={cn(styles.tone, styles.mapPanel, 'min-w-0 space-y-2 rounded-lg border border-border p-2 scroll-mt-[var(--cdss-steps-clear,0.5rem)]')}
              data-section={SECTION_TONE[block]}
              data-testid={`cdss-visit-column-${block}`}
              data-block={block}
              data-open={isOpen ? 'true' : undefined}
            >
              {/* The steps above name the section; its full name is read out,
                  and a move from a foot button lands here. */}
              <h3 id={`cdss-visit-column-${block}-title`} tabIndex={-1} className="sr-only">{blockTitle(block, isEnglish)}</h3>
              {head ? (
                // The module a tile opened, at the head of its section.
                <div className="space-y-1.5 scroll-mt-[var(--cdss-steps-clear,0.5rem)]" data-testid="cdss-visit-detail-slot" data-dp={head.dp}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-0.5" data-map-heading="">
                    <span className="font-mono text-[11px] font-semibold text-muted-foreground">{head.dp}</span>
                    <span className="text-sm font-semibold text-foreground">{head.label}</span>
                    {head.source !== sourceOfPage ? (
                      <Badge variant="outline" className="h-5 px-1 text-[10px]">{sourceTag(head)}</Badge>
                    ) : null}
                    <StatePill state={head.state} isEnglish={isEnglish} decided={Boolean(decisionOf(head))} inQueue={queuedDps.has(head.dp)} />
                    {!decisionOf(head) && (pendingLine?.(head) ?? head.headline ?? head.why) ? (
                      <span className="basis-full text-sm text-foreground">{pendingLine?.(head) ?? head.headline ?? head.why}</span>
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
              {/* An open card is the section while it is open — the right side
                  shows what was pressed on the left, not the card stacked
                  over the section's own questions (clinician feedback: 「為什麼
                  DP-01 跟 24 同時出現」). The rest stays mounted, hidden, and
                  comes back on 收合. */}
              <div hidden={Boolean(head)} className="space-y-2" data-testid={`cdss-visit-column-${block}-body`}>
                {asks && asksIn === block ? (
                  <div
                    className={cn('space-y-1.5 rounded-md border bg-background px-2.5 py-2', asks.pending ? 'border-dashed border-border' : 'border-border')}
                    data-testid={`cdss-visit-pending-asks-${block}`}
                    data-done={asks.pending ? undefined : 'true'}
                  >
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground" role="status">
                      {asks.pending ? null : <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />}
                      {asks.pending
                        ? (isEnglish ? 'Every-visit questions still open — answer here' : '每次必問還沒答完，可直接在這裡答')
                        : (isEnglish ? 'Every-visit questions answered' : '每次必問已答完')}
                    </p>
                    {asks.content}
                    {/* An answer can open more to ask in 01 (喘變差 opens the
                        fuller assessment there): say so, one press away. */}
                    {!asks.pending && asks.opensMore ? (
                      <button
                        type="button"
                        className="inline-flex min-h-9 items-center gap-1 rounded-md px-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => showStep('status', true)}
                        data-testid={`cdss-visit-pending-asks-to-status-${block}`}
                      >
                        {`${blockTitle('status', isEnglish)}${isEnglish ? ': ' : '：'}${stepSummaries.status.text}`}
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {note ? (
                  <p className="px-0.5 text-xs text-muted-foreground" data-testid={`cdss-visit-column-${block}-closed`}>
                    {note}
                  </p>
                ) : null}
                {leads?.[block] ? <div className="space-y-3" data-testid={`cdss-visit-lead-${block}`}>{leads[block]}</div> : null}
                {checklists.map((point) => (
                  <div key={visitDecisionKey(point)} className="space-y-1 rounded-md border border-border bg-background px-2.5 py-2" data-testid={`cdss-visit-checklist-${point.dp}`}>
                    {/* Still needing the clinician, its name is the press to its
                        card, over what it has and lacks. */}
                    {stillOpen.includes(point) ? (
                      <StillOpenRow point={point} isEnglish={isEnglish} sourceOfPage={sourceOfPage} onOpen={() => open(point)} />
                    ) : (
                      <p className="text-[11px] font-semibold text-muted-foreground" data-map-heading="">
                        <span className="font-mono">{point.dp}</span> {point.label}
                      </p>
                    )}
                    <DecisionPointChecklist items={point.checklist!} isEnglish={isEnglish} compact />
                  </div>
                ))}
                {stillOpenListed.length ? (
                  <div className="space-y-1 rounded-md border border-border bg-background px-2 py-2" data-testid={`cdss-visit-still-open-${block}`}>
                    <p className="px-0.5 text-[11px] font-semibold text-muted-foreground" data-map-heading="">
                      {isEnglish ? 'Also for you in this section' : '這一區還需要你看'}
                    </p>
                    <ul className="space-y-1">
                      {stillOpenListed.map((point) => (
                        <li key={visitDecisionKey(point)}>
                          <StillOpenRow point={point} isEnglish={isEnglish} sourceOfPage={sourceOfPage} onOpen={() => open(point)} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
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
                ) : !nextBlock && summary ? (
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      className={nextButtonClass}
                      data-section="summary"
                      onClick={() => showStep('summary', true)}
                      data-testid={`cdss-visit-next-${block}`}
                    >
                      {isEnglish ? 'Finish: this visit’s summary' : '完成：本次摘要'}
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
                      onClick={() => showStep(nextBlock, true)}
                      data-testid={`cdss-visit-next-${block}`}
                    >
                      {closedNote(nextBlock)
                        ? `${blockTitle(nextBlock, isEnglish)}${isEnglish ? ': ' : '：'}${closedNote(nextBlock)}`
                        : `${isEnglish ? 'Next: ' : '下一區：'}${blockTitle(nextBlock, isEnglish)} · ${combinedSummary(nextBlock).text}`}
                      {closedNote(nextBlock) ? null : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </div>
                ) : null}
              </div>
            </section>
          )
        })}
        {summary ? (
          <section
            id="cdss-visit-column-summary"
            aria-label={isEnglish ? 'This visit’s summary' : '本次摘要'}
            hidden={!summaryShown}
            className="min-w-0 space-y-2 rounded-lg border border-border p-2 scroll-mt-[var(--cdss-steps-clear,0.5rem)]"
            data-testid="cdss-visit-column-summary"
            data-open={summaryShown ? 'true' : undefined}
          >
            <h3 id="cdss-visit-column-summary-title" tabIndex={-1} className="sr-only">{isEnglish ? 'This visit’s summary' : '本次摘要'}</h3>
            {/* The summary is where a visit ends, and what it copies is only
                what was decided: a section still asking for something says
                so here, one press from it, before the note leaves the page. */}
            {summaryLeft.length ? (
              <div className="space-y-1.5" data-testid="cdss-visit-summary-left">
                <p className="text-xs font-semibold text-muted-foreground">{isEnglish ? 'Still open' : '還沒處理'}</p>
                <div className="flex flex-wrap gap-2">
                  {summaryLeft.map((block) => (
                    <button
                      key={block}
                      type="button"
                      className={nextButtonClass}
                      data-section={SECTION_TONE[block]}
                      onClick={() => showStep(block, true)}
                      data-testid={`cdss-visit-summary-left-${block}`}
                    >
                      {`${blockShortTitle(block, isEnglish)} · ${stepSummaries[block].text}`}
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {summary.content}
          </section>
        ) : null}
      </div>
      </div>
    </section>
  )
}
