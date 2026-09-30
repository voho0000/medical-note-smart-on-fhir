"use client"

import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/src/shared/utils/cn.utils'
import { criteriaOf, sourceTag, type DecisionBasisItem, type DecisionCriteriaGroupView, type QueueRow, type QueueStep } from './visit-decisions'
import type { DecisionPointView, VisitAction } from '../../types'
import { VisitDecisionControls } from './VisitDecisionControls'
import { StatePill } from './visit-presentation'
import rowStyles from './point-rows.module.css'

/**
 * 今天要決定: the only place on the screen with the day's treatment buttons in
 * view at first paint. One row per queued decision point, safety first, in the
 * pack's order. Each row reads DP · the pack's question · its one-line reason ·
 * the recommended action · 「其他」. A decided row collapses in place to the
 * decision and its response check; a chain row walks on to its next step
 * without adding a row.
 */
export function TodayQueue({
  rows,
  isEnglish,
  sourceOfPage,
  onDecide,
  onClear,
  title,
  testId = 'cdss-visit-queue',
  hideWhenEmpty = false,
  detailFor,
  onOpenDetail,
  basis,
}: {
  rows: readonly QueueRow[]
  isEnglish: boolean
  /** The page's own pack; a row from the companion pack is labelled with its source. */
  sourceOfPage: DecisionPointView['source']
  onDecide?: (step: QueueStep, action: VisitAction) => void
  onClear?: (step: QueueStep) => void
  /** The heading: 「今天要決定」, or a section's own (「待決定」, 「診斷決定」). */
  title?: string
  testId?: string
  /** Inside a section, an empty list says nothing rather than 「今天沒有要決定的事」. */
  hideWhenEmpty?: boolean
  /** The opened point's card, drawn under its own row. */
  detailFor?: (point: DecisionPointView) => ReactNode
  /** Opens (or closes) a row's card — its reasons, chain and guideline. */
  onOpenDetail?: (point: DecisionPointView) => void
  /** What a row's open decision reads from the record, printed under it (see `decisionBasis`). */
  basis?: (point: DecisionPointView) => readonly DecisionBasisItem[]
}) {
  const listRef = useRef<HTMLOListElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  // The row a decision was just taken on, so focus can move on once the store
  // has re-rendered the queue: to the same row when its chain moved on or its
  // decision was withdrawn, else to the next row still waiting, else to the
  // queue's heading, which then reads that everything is decided.
  const focusFrom = useRef<string | null>(null)

  useLayoutEffect(() => {
    const from = focusFrom.current
    const list = listRef.current
    if (!from || !list) return
    focusFrom.current = null
    const rowElements = [...list.querySelectorAll<HTMLElement>('[data-visit-queue-row]')]
    const index = rowElements.findIndex((element) => element.dataset.visitQueueRow === from)
    const ordered = index < 0 ? rowElements : [...rowElements.slice(index), ...rowElements.slice(0, index)]
    for (const element of ordered) {
      const primary = element.querySelector<HTMLButtonElement>('[data-visit-primary]:not([disabled])')
      if (primary) {
        primary.focus()
        return
      }
    }
    headingRef.current?.focus()
  })

  const pending = rows.filter((row) => row.current).length
  const headingId = `${testId}-title`
  if (hideWhenEmpty && rows.length === 0) return null
  return (
    <section aria-labelledby={headingId} className="space-y-1.5" data-testid={testId}>
      {/* A subheading as the map prints its groups (「分流與安全」), not a panel title. */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-0.5">
        <h3
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="text-[11px] font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {title ?? (isEnglish ? 'To decide today' : '今天要決定')}
        </h3>
        {rows.length ? (
          <span className="text-[11px] tabular-nums text-muted-foreground" role="status" data-testid={`${testId}-progress`}>
            {isEnglish
              ? `${rows.length - pending}/${rows.length} decided`
              : `已決定 ${rows.length - pending}/${rows.length}`}
          </span>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-md border border-border px-2.5 py-2 text-sm text-muted-foreground" data-testid={`${testId}-empty`}>
          {isEnglish ? 'Nothing to decide today.' : '今天沒有要決定的事。'}
        </p>
      ) : (
        <ol ref={listRef} className={rowStyles.list}>
          {rows.map((row) => (
            <QueueRowBox
              key={row.key}
              row={row}
              isEnglish={isEnglish}
              sourceOfPage={sourceOfPage}
              {...(onDecide ? { onDecide: (step, action) => { focusFrom.current = row.key; onDecide(step, action) } } : {})}
              {...(onClear ? { onClear: (step) => { focusFrom.current = row.key; onClear(step) } } : {})}
              {...(detailFor ? { detailFor } : {})}
              {...(onOpenDetail ? { onOpenDetail } : {})}
              {...(basis ? { basis } : {})}
            />
          ))}
        </ol>
      )}
    </section>
  )
}

const DETAIL_LINK = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-coarse:h-11 pointer-coarse:w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** A row's first column: DP code, name and source. */
function RowLead({ point, sourceOfPage }: { point: DecisionPointView; sourceOfPage: DecisionPointView['source'] }) {
  return (
    <span className={rowStyles.lead}>
      <span className="shrink-0 font-mono text-[11px] font-semibold text-muted-foreground">{point.dp}</span>
      <span className="min-w-0 text-sm font-medium leading-snug text-foreground">{point.label}</span>
      {point.source !== sourceOfPage ? (
        <Badge variant="outline" className="h-5 shrink-0 px-1 text-[10px]">{sourceTag(point)}</Badge>
      ) : null}
    </span>
  )
}

/**
 * A row's last column: the fold mark that opens its card (reasons, chain,
 * guideline) — a chevron alone, as a map cell's is (clinician feedback
 * 2026-09-28: 「依據與細節這字完全沒必要，就一個下拉的符號就好」); its name
 * stays for a screen reader and a pointer's tooltip.
 */
function RowLink({ point, isEnglish, detailOpen, onOpenDetail }: {
  point: DecisionPointView
  isEnglish: boolean
  detailOpen: boolean
  onOpenDetail?: (point: DecisionPointView) => void
}) {
  return (
    <span className={rowStyles.link}>
      {onOpenDetail ? (
        <button
          type="button"
          className={DETAIL_LINK}
          aria-expanded={detailOpen}
          aria-label={isEnglish ? 'Reasons and guideline' : '依據與細節'}
          title={isEnglish ? 'Reasons and guideline' : '依據與細節'}
          onClick={() => onOpenDetail(point)}
          data-visit-row-detail={point.dp}
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', detailOpen && 'rotate-180')} aria-hidden="true" />
        </button>
      ) : null}
    </span>
  )
}

export function ChainDone({ steps }: { steps: readonly QueueStep[] }) {
  return (
    <>
      {steps.map((step) => (
        <p key={step.key} className="flex items-center gap-1.5 text-xs text-muted-foreground" data-visit-chain-done={step.point.dp}>
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
          <span className="font-mono">{step.point.dp}</span>
          <span>{step.decision?.record.actionLabel ?? step.decision?.action.label}</span>
        </p>
      ))}
    </>
  )
}

/**
 * One decision to take today, on one line of the map (clinician decision
 * 2026-09-28: 「用一行式，設成預設」): the DP code and name, the state in the
 * map's pill, the pack's question with its one-line reason, the buttons, and
 * 依據與細節 — in columns that line up down the section (see
 * point-rows.module.css). A decided row collapses to the decision; a chain
 * walks on in the same row. Used in the lists and in 02's 四支柱.
 */
export function QueueRowBox({
  row,
  isEnglish,
  sourceOfPage,
  onDecide,
  onClear,
  detailFor,
  onOpenDetail,
  detailOpen,
  queued = true,
  as: Element = 'li',
  basis,
}: {
  row: QueueRow
  isEnglish: boolean
  sourceOfPage: DecisionPointView['source']
  onDecide?: (step: QueueStep, action: VisitAction) => void
  onClear?: (step: QueueStep) => void
  detailFor?: (point: DecisionPointView) => ReactNode
  onOpenDetail?: (point: DecisionPointView) => void
  /** The box's card is open, drawn by the caller outside the box (02's 四支柱). */
  detailOpen?: boolean
  /**
   * False for a pillar that decides in its box without being on today's list
   * (a dose to confirm): the box is the same, but it is not one of the rows.
   */
  queued?: boolean
  as?: 'li' | 'div'
  /** What the open decision reads from the record, printed under its reason. */
  basis?: (point: DecisionPointView) => readonly DecisionBasisItem[]
}) {
  const current = row.current
  const decidedSteps = row.steps.filter((step) => step.decision)
  const shown = current ?? row.steps[row.steps.length - 1]
  const point = shown.point
  const detail = detailFor?.(point)
  const open = detailOpen ?? Boolean(detail)
  return (
    <Element
      className="scroll-mt-2"
      data-visit-queue-row={queued ? row.key : undefined}
      data-visit-point-box={queued ? undefined : point.dp}
      data-visit-queue-dp={row.steps[0].point.dp}
      data-visit-current-dp={current?.point.dp}
      data-visit-queue-state={point.state}
      data-decided={current ? 'false' : 'true'}
    >
      <div className={cn(rowStyles.row, open && rowStyles.open, current ? (row.safety ? rowStyles.safety : rowStyles.actionable) : rowStyles.recorded)}>
        <RowLead point={point} sourceOfPage={sourceOfPage} />
        <span className={rowStyles.state}>
          <StatePill state={row.safety && current ? 'safety' : point.state} isEnglish={isEnglish} inQueue decided={!current} />
        </span>
        <div className={rowStyles.main}>
          {current ? (
            // With room, the buttons keep the row's right edge and the words
            // sit beside them; without it they drop under the words, which
            // never go narrower than 14rem. Decided by the room in this
            // column, not the page's width: the map in the screen's middle
            // panel with three answers (AF DP-01) squeezed the words to a
            // few characters a line (clinician feedback 2026-09-29: 「你要假設
            // 今天是在畫面的正中央都能好好呈現」).
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
              <div className="min-w-0 flex-1 basis-56 space-y-0.5">
                <ChainDone steps={decidedSteps} />
                <p className="text-sm font-semibold leading-snug text-foreground" data-visit-headline="">{point.headline ?? point.label}</p>
                {point.why ? <p className="text-xs leading-relaxed text-muted-foreground" data-visit-why="">{point.why}</p> : null}
              </div>
              {/* Never wider than the column: in a narrow panel the buttons
                  wrap among themselves instead of running past the frame,
                  which clips them (#177 review: 「都有」 cut off at 320px). */}
              <div className="min-w-0 max-w-full shrink-0">
                <VisitDecisionControls
                  point={point}
                  surface="queue"
                  isEnglish={isEnglish}
                  onDecide={onDecide ? (action) => onDecide(current, action) : undefined}
                />
              </div>
              {/* The row's whole width, under the words and the buttons alike. */}
              <DecisionEvidence point={point} basis={basis?.(point) ?? []} isEnglish={isEnglish} />
            </div>
          ) : (
            <div className="space-y-0.5">
              <p className="sr-only" data-visit-decided-about="">{point.label}</p>
              <ChainDone steps={decidedSteps.slice(0, -1)} />
              <VisitDecisionControls
                point={point}
                decision={shown.decision}
                surface="queue"
                isEnglish={isEnglish}
                onClear={onClear ? () => onClear(shown) : undefined}
              />
            </div>
          )}
        </div>
        <RowLink point={point} isEnglish={isEnglish} detailOpen={open} {...(onOpenDetail ? { onOpenDetail } : {})} />
      </div>
      {detail ? <div className={rowStyles.detail}>{detail}</div> : null}
    </Element>
  )
}

/**
 * What an open decision turns on: the pack's criteria, each marked and with
 * the patient's value (「✓ 年齡 ≥80 80 歲」), then the record values it reads
 * that no criterion already shows. A criterion's value that the record line
 * also carries takes its date from there, and is said once.
 */
export function DecisionEvidence({ point, basis, isEnglish }: { point: DecisionPointView; basis: readonly DecisionBasisItem[]; isEnglish: boolean }) {
  const groups = criteriaOf(point)
  const shown = new Set<DecisionBasisItem>()
  const dated = groups.map((group) => ({
    ...group,
    items: group.items.map((item) => {
      const from = item.value ? basis.find((value) => value.value === item.value) : undefined
      if (from) shown.add(from)
      return { ...item, ...(from?.date ? { date: from.date } : {}) }
    }),
  }))
  return (
    <>
      <DecisionCriteria groups={dated} isEnglish={isEnglish} />
      <DecisionBasis items={basis.filter((item) => !shown.has(item))} isEnglish={isEnglish} />
    </>
  )
}

/** A criteria group whose values carry the date the record line gave them. */
type DatedCriteriaGroup = { title: string; items: readonly (DecisionCriteriaGroupView['items'][number] & { date?: string })[] }

const MARK: Record<'met' | 'unmet' | 'unknown', { symbol: string; zh: string; en: string; tone: string }> = {
  met: { symbol: '✓', zh: '符合', en: 'met', tone: 'text-emerald-700 dark:text-emerald-300' },
  unmet: { symbol: '✗', zh: '不符合', en: 'not met', tone: 'text-muted-foreground' },
  unknown: { symbol: '？', zh: '未知', en: 'unknown', tone: 'text-amber-700 dark:text-amber-300' },
}

/**
 * The criteria, one group a line (「apixaban 5 → 2.5 mg bid：3 項中 2 項」
 * then ✓ 年齡 ≥80 80 歲 · ✓ 體重 ≤60 kg 58 kg · ✗ Cr ≥1.5 mg/dL 1.3 mg/dL).
 * A criterion the record cannot settle reads ？, never ✗.
 */
function DecisionCriteria({ groups, isEnglish }: { groups: readonly DatedCriteriaGroup[]; isEnglish: boolean }) {
  if (groups.length === 0) return null
  return (
    <div className="basis-full space-y-1 text-xs leading-5" data-visit-criteria="">
      {groups.map((group) => (
        <div key={group.title} className="min-w-0" data-visit-criteria-group={group.title}>
          <p className="font-medium text-foreground">{group.title}</p>
          <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
            {group.items.map((item) => {
              const mark = MARK[item.met === true ? 'met' : item.met === false ? 'unmet' : 'unknown']
              return (
                <li key={item.label} className="flex min-w-0 max-w-full flex-wrap items-baseline gap-x-1" data-met={item.met === undefined ? 'unknown' : String(item.met)}>
                  <span className={cn('shrink-0 font-semibold', mark.tone)} aria-hidden="true">{mark.symbol}</span>
                  <span className="sr-only">{isEnglish ? `${mark.en}: ` : `${mark.zh}：`}</span>
                  <span className={cn('min-w-0 break-words', item.met === false ? 'text-muted-foreground' : 'text-foreground')}>{item.label}</span>
                  {item.value ? <span className="min-w-0 max-w-full break-words font-medium tabular-nums text-foreground">{item.value}</span> : null}
                  {item.date ? <span className="shrink-0 tabular-nums text-muted-foreground">{item.date}</span> : null}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

/**
 * The record values an open decision reads — 年齡 80 歲 · 體重 58 kg 09-27 ·
 * Cr 1.3 mg/dL 09-20 — in view under its reason rather than folded in its
 * card, so the row holds what the choice is made with.
 */
function DecisionBasis({ items, isEnglish }: { items: readonly DecisionBasisItem[]; isEnglish: boolean }) {
  if (items.length === 0) return null
  return (
    <dl
      className="flex basis-full flex-wrap gap-x-3 gap-y-0.5 text-xs leading-5"
      aria-label={isEnglish ? 'What this decision reads' : '本病人依據'}
      data-visit-basis=""
    >
      {items.map((item) => (
        // A label as long as 「ARNI (ACE inhibitor/ARB when ARNI is not
        // feasible)」 wraps in a narrow column, and its value follows onto the
        // next line whole rather than being squeezed to a letter a line or
        // pushed out of the row (#201 review, 320 px).
        <div key={`${item.label}|${item.value}`} className="flex min-w-0 max-w-full flex-wrap items-baseline gap-x-1">
          <dt className="min-w-0 break-words text-muted-foreground">{item.label}</dt>
          <dd className="min-w-0 max-w-full break-words font-medium tabular-nums text-foreground">{item.value}</dd>
          {item.date ? <dd className="shrink-0 tabular-nums text-muted-foreground">{item.date}</dd> : null}
        </div>
      ))}
    </dl>
  )
}

/**
 * A point with nothing to decide today, on the same line as one that has — so
 * 02's 四支柱 are four rows whatever their state. Absent points (不適用) are
 * muted, as on the map.
 */
export function PointBox({
  point,
  isEnglish,
  sourceOfPage,
  detail,
  onOpenDetail,
  detailOpen,
}: {
  point: DecisionPointView
  isEnglish: boolean
  sourceOfPage: DecisionPointView['source']
  detail?: ReactNode
  onOpenDetail?: (point: DecisionPointView) => void
  /** The box's card is open, drawn by the caller outside the box. */
  detailOpen?: boolean
}) {
  const absent = point.state === 'not-applicable' || point.state === 'not-included'
  const open = detailOpen ?? Boolean(detail)
  return (
    <div data-visit-point-box={point.dp} data-state={point.state} className="scroll-mt-2">
      <div className={cn(rowStyles.row, absent && rowStyles.absent, open && rowStyles.open)}>
        <RowLead point={point} sourceOfPage={sourceOfPage} />
        <span className={rowStyles.state}><StatePill state={point.state} isEnglish={isEnglish} /></span>
        <div className={cn(rowStyles.main, 'space-y-0.5')}>
          <p className={cn('text-sm leading-snug', absent ? 'text-muted-foreground' : 'text-foreground')}>{point.headline ?? point.label}</p>
          {point.why && !absent ? <p className="text-xs leading-relaxed text-muted-foreground">{point.why}</p> : null}
        </div>
        <RowLink point={point} isEnglish={isEnglish} detailOpen={open} {...(onOpenDetail ? { onOpenDetail } : {})} />
      </div>
      {detail ? <div className={rowStyles.detail}>{detail}</div> : null}
    </div>
  )
}
