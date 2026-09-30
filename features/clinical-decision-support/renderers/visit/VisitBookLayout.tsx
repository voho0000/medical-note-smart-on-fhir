"use client"

import { Fragment, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/src/shared/utils/cn.utils'
import {
  ABSENT_STATES,
  BLOCK_ORDER,
  blockTitle,
  sourceTag,
  type DecisionBasisItem,
  type QueueRow,
  type QueueStep,
} from './visit-decisions'
import type { DecisionPointView, VisitAction, VisitBlock } from '../../types'
import { ChainDone, DecisionEvidence } from './TodayQueue'
import { VisitDecisionControls } from './VisitDecisionControls'

/**
 * The visit laid out as a pocket-handbook page (owner request 2026-09-30,
 * after the Pocket Medicine-style prototype: 「把這個版面套到 localhost 上的
 * 真實 CDSS 試試看」). An experiment beside the decision map, opened with
 * `?visit=book`; the map stays the page's layout.
 *
 * Left, the decision map: every point of the page under its group, with a
 * mark for where it stands today — the map says where the decisions are.
 * Right, the page itself in the map's order, each point once: its code and
 * name, what the pack says, the patient's values and criteria, and the
 * buttons, all in view. A point the clinician has to weigh (criteria, a
 * chain, several options) carries 看依據, which opens its card under it; a
 * simple one is a reminder and needs none.
 */

export type BookMark = 'safety' | 'act' | 'ask' | 'done' | 'info' | 'absent'

/** What a point is on this page: a decision row, a line, or covered by another. */
export type BookEntry =
  | { kind: 'row'; point: DecisionPointView; row: QueueRow; queued: boolean }
  | { kind: 'covered'; point: DecisionPointView; by: DecisionPointView }
  | { kind: 'line'; point: DecisionPointView }
  | { kind: 'slot'; point: DecisionPointView; content: ReactNode }
  | { kind: 'skip'; point: DecisionPointView; anchorOf: DecisionPointView }

export interface VisitBookLayoutProps {
  points: readonly DecisionPointView[]
  isEnglish: boolean
  sourceOfPage: DecisionPointView['source']
  entryOf: (point: DecisionPointView) => BookEntry
  markOf: (point: DecisionPointView) => BookMark
  /** A point with reasoning worth opening: criteria, a chain, several options. */
  isComplex: (point: DecisionPointView) => boolean
  openKeyOf: (point: DecisionPointView) => string
  openKey: string | null
  onToggle: (point: DecisionPointView) => void
  /** The opened point's card, drawn under its row. */
  detail: ReactNode
  onDecide?: (step: QueueStep, action: VisitAction, queued: boolean) => void
  onClear?: (step: QueueStep) => void
  basisOf: (point: DecisionPointView) => readonly DecisionBasisItem[]
  /** The page's inputs a point reads, drawn in view under it. */
  extrasOf: (point: DecisionPointView) => ReactNode
  top: ReactNode
  blockFooters?: Partial<Record<VisitBlock, ReactNode>>
  end: ReactNode
}

export function bookAnchor(point: Pick<DecisionPointView, 'source' | 'dp'>): string {
  return `cdss-book-${point.source}-${point.dp}`
}

const MARK_CLASS: Record<Exclude<BookMark, 'done'>, string> = {
  safety: 'h-2.5 w-2.5 rounded-sm bg-destructive',
  act: 'h-2.5 w-2.5 rounded-full bg-amber-500',
  ask: 'h-2.5 w-2.5 rounded-full border-2 border-primary',
  info: 'h-1.5 w-1.5 rounded-full bg-muted-foreground/60',
  absent: 'h-1.5 w-1.5 rounded-full bg-transparent',
}

function Mark({ mark }: { mark: BookMark }) {
  return (
    <span className="inline-flex h-5 w-3 shrink-0 items-center justify-center" aria-hidden="true">
      {mark === 'done'
        ? <Check className="h-3 w-3 text-emerald-700 dark:text-emerald-300" />
        : <span className={MARK_CLASS[mark]} />}
    </span>
  )
}

const MARK_WORDS: Record<BookMark, { zh: string; en: string }> = {
  safety: { zh: '安全', en: 'Safety' },
  act: { zh: '待決定', en: 'To decide' },
  ask: { zh: '待答', en: 'To answer' },
  done: { zh: '已定', en: 'Settled' },
  info: { zh: '資訊', en: 'Info' },
  absent: { zh: '不適用', en: 'Not applicable' },
}

interface Section {
  key: string
  block: VisitBlock
  title: string
  points: DecisionPointView[]
}

/** The page's groups in the map's order: by column, then as the pack lists them. */
function sectionsOf(points: readonly DecisionPointView[]): Section[] {
  const sections: Section[] = []
  for (const block of BLOCK_ORDER) {
    for (const point of points.filter((candidate) => candidate.block === block)) {
      const key = `${block}|${point.group}`
      let section = sections.find((candidate) => candidate.key === key)
      if (!section) {
        section = { key, block, title: point.groupLabel ?? point.group, points: [] }
        sections.push(section)
      }
      section.points.push(point)
    }
  }
  return sections
}

const CODE = 'shrink-0 font-mono text-[11px] font-semibold text-muted-foreground'

export function VisitBookLayout({
  points,
  isEnglish,
  sourceOfPage,
  entryOf,
  markOf,
  isComplex,
  openKeyOf,
  openKey,
  onToggle,
  detail,
  onDecide,
  onClear,
  basisOf,
  extrasOf,
  top,
  blockFooters,
  end,
}: VisitBookLayoutProps) {
  const sections = sectionsOf(points)
  const goTo = (point: DecisionPointView) => {
    const entry = entryOf(point)
    const target = document.getElementById(bookAnchor(entry.kind === 'skip' ? entry.anchorOf : point))
    target?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
    target?.focus?.({ preventScroll: true })
  }
  const counts = { act: 0, ask: 0 }
  for (const point of points) {
    const mark = markOf(point)
    if (mark === 'act' || mark === 'safety') counts.act += 1
    if (mark === 'ask') counts.ask += 1
  }

  const reasoningButton = (point: DecisionPointView) => {
    if (!isComplex(point)) return null
    const open = openKey === openKeyOf(point)
    return (
      <button
        type="button"
        className={cn(
          'inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors pointer-coarse:min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          open ? 'border-primary bg-primary/10 text-primary' : 'border-primary/30 bg-primary/5 text-primary hover:bg-primary/10',
        )}
        aria-expanded={open}
        onClick={() => onToggle(point)}
        data-book-reasoning={point.dp}
      >
        {open ? (isEnglish ? 'Hide reasoning' : '收起依據') : (isEnglish ? 'Reasoning ▸' : '看依據 ▸')}
      </button>
    )
  }

  const lead = (point: DecisionPointView, mark: BookMark) => (
    <div className="flex min-w-0 items-start gap-1.5">
      <Mark mark={mark} />
      <span className="sr-only">{isEnglish ? MARK_WORDS[mark].en : MARK_WORDS[mark].zh}</span>
      <span className={cn(CODE, 'pt-px')}>{point.dp}</span>
      <span className="min-w-0 text-sm font-semibold leading-snug text-foreground">{point.label}</span>
      {point.source !== sourceOfPage ? (
        <Badge variant="outline" className="h-5 shrink-0 px-1 text-[10px]">{sourceTag(point)}</Badge>
      ) : null}
    </div>
  )

  const opened = (point: DecisionPointView) => (openKey === openKeyOf(point) ? detail : null)

  const renderEntry = (point: DecisionPointView) => {
    const entry = entryOf(point)
    if (entry.kind === 'skip') return null
    const mark = markOf(point)
    const extras = extrasOf(point)
    const frame = (children: ReactNode, tone?: 'act' | 'safety' | 'muted') => (
      <div
        key={`${point.source}:${point.dp}`}
        id={bookAnchor(point)}
        tabIndex={-1}
        className={cn(
          'grid scroll-mt-3 gap-x-4 gap-y-1.5 px-3 py-2.5 focus-visible:outline-none @min-[40rem]:grid-cols-[12rem_minmax(0,1fr)]',
          tone === 'act' && 'bg-amber-50/60 dark:bg-amber-500/5',
          tone === 'safety' && 'bg-destructive/5',
        )}
        data-book-dp={point.dp}
        data-book-mark={mark}
      >
        {lead(point, mark)}
        <div className="min-w-0 space-y-1.5">{children}</div>
      </div>
    )

    if (entry.kind === 'slot') {
      return frame(
        <>
          {entry.content}
          {extras}
        </>,
      )
    }
    if (entry.kind === 'covered') {
      return frame(
        <p className="text-sm text-muted-foreground">
          {isEnglish ? `Decided with ${entry.by.dp} ${entry.by.label}` : `與 ${entry.by.dp} ${entry.by.label} 一起決定`}
          {point.headline ? ` · ${point.headline}` : ''}
        </p>,
      )
    }
    if (entry.kind === 'line') {
      return frame(
        <>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <p className={cn('text-sm leading-snug', mark === 'ask' ? 'text-foreground' : 'text-muted-foreground')}>{point.headline ?? point.label}</p>
            {reasoningButton(point)}
          </div>
          {point.why ? <p className="text-xs leading-relaxed text-muted-foreground">{point.why}</p> : null}
          {extras}
          {opened(point)}
        </>,
      )
    }

    // A decision: today's step with its buttons, or the decision recorded.
    const { row, queued } = entry
    const current = row.current
    const shown = current ?? row.steps[row.steps.length - 1]
    const decided = row.steps.filter((step) => step.decision)
    return frame(
      <>
        {current ? (
          <>
            <ChainDone steps={decided} />
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <p className="text-sm font-semibold leading-snug text-foreground" data-visit-headline="">{shown.point.headline ?? shown.point.label}</p>
              {reasoningButton(point)}
            </div>
            {shown.point.why ? <p className="text-xs leading-relaxed text-muted-foreground" data-visit-why="">{shown.point.why}</p> : null}
            <VisitDecisionControls
              point={shown.point}
              surface="queue"
              isEnglish={isEnglish}
              onDecide={onDecide ? (action) => onDecide(current, action, queued) : undefined}
            />
            {/* The criteria carry the values the decision turns on; the record
                line beneath them, when there are criteria, is the module's
                whole evidence and stays in its card. */}
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <DecisionEvidence point={shown.point} basis={shown.point.criteria?.length ? [] : basisOf(shown.point)} isEnglish={isEnglish} />
            </div>
          </>
        ) : (
          <>
            <ChainDone steps={decided.slice(0, -1)} />
            <div className="flex flex-wrap items-center gap-2">
              <VisitDecisionControls
                point={shown.point}
                decision={shown.decision}
                surface="queue"
                isEnglish={isEnglish}
                onClear={onClear ? () => onClear(shown) : undefined}
              />
              {reasoningButton(point)}
            </div>
          </>
        )}
        {extras}
        {opened(point)}
      </>,
      current && (mark === 'act' || mark === 'safety') ? (row.safety ? 'safety' : 'act') : undefined,
    )
  }

  const byBlock = (block: VisitBlock) => sections.filter((section) => section.block === block)

  return (
    <div className="space-y-3" data-testid="cdss-visit-book">
      {top}
      <div className="grid items-start gap-4 @min-[56rem]:grid-cols-[13.5rem_minmax(0,1fr)]">
        <nav
          aria-label={isEnglish ? 'Decision map' : '決策地圖'}
          className="rounded-lg border border-border bg-card p-2 @min-[56rem]:sticky @min-[56rem]:top-2 @min-[56rem]:max-h-[calc(100vh-1rem)] @min-[56rem]:overflow-y-auto"
          data-testid="cdss-book-map"
        >
          <div className="flex items-baseline justify-between gap-2 px-1.5 pb-1">
            <span className="text-sm font-semibold text-foreground">{isEnglish ? 'Decision map' : '決策地圖'}</span>
            <span className="text-[11px] text-muted-foreground">
              {isEnglish ? `${counts.act} to decide · ${counts.ask} to answer` : `待決定 ${counts.act} · 待答 ${counts.ask}`}
            </span>
          </div>
          <div className="grid gap-x-3 @min-[40rem]:grid-cols-2 @min-[56rem]:grid-cols-1">
            {sections.map((section, index) => (
              <div key={section.key} className="pt-1.5">
                {index === 0 || sections[index - 1].block !== section.block ? (
                  <p className="mt-1 border-b border-border px-1.5 pb-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground/80">{blockTitle(section.block, isEnglish)}</p>
                ) : null}
                <p className="px-1.5 text-[11px] font-semibold text-muted-foreground">{section.title}</p>
                <ul>
                  {section.points.map((point) => {
                    const mark = markOf(point)
                    return (
                      <li key={`${point.source}:${point.dp}`}>
                        <button
                          type="button"
                          className={cn(
                            'flex min-h-7 w-full items-center gap-1.5 rounded px-1.5 text-left text-xs transition-colors hover:bg-muted/60 pointer-coarse:min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                            mark === 'act' || mark === 'safety' ? 'bg-amber-50 font-semibold text-amber-900 dark:bg-amber-500/10 dark:text-amber-200' : mark === 'absent' ? 'text-muted-foreground/70' : 'text-foreground',
                          )}
                          onClick={() => goTo(point)}
                          data-book-map-dp={point.dp}
                          data-book-mark={mark}
                        >
                          <Mark mark={mark} />
                          <span className="shrink-0 font-mono text-[10px] font-semibold">{point.dp}</span>
                          <span className="min-w-0 truncate">{point.label}</span>
                          {isComplex(point) ? <span className="ml-auto shrink-0 text-[10px] text-primary" aria-hidden="true">▸</span> : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <div className="min-w-0 space-y-5">
          {BLOCK_ORDER.map((block) => (
            <section key={block} className="space-y-3" aria-label={blockTitle(block, isEnglish)} data-book-block={block}>
              <h3 className="border-b border-border pb-1 text-xs font-semibold tracking-wide text-muted-foreground">{blockTitle(block, isEnglish)}</h3>
              {byBlock(block).map((section) => {
                const present = section.points.filter((point) => !ABSENT_STATES.has(point.state))
                const absent = section.points.filter((point) => ABSENT_STATES.has(point.state))
                return (
                  <section key={section.key} className="space-y-1.5" data-book-section={section.key}>
                    <h4 className="px-0.5 text-base font-semibold text-foreground">{section.title}</h4>
                    {present.length ? (
                      <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-background">
                        {present.map((point) => <Fragment key={`${point.source}:${point.dp}`}>{renderEntry(point)}</Fragment>)}
                      </div>
                    ) : null}
                    {absent.length ? (
                      <p className="px-0.5 text-xs text-muted-foreground/80" data-book-absent={section.key}>
                        {isEnglish ? 'Not applicable: ' : '不適用　'}
                        {absent.map((point, index) => (
                          <span key={`${point.source}:${point.dp}`} id={bookAnchor(point)} tabIndex={-1}>
                            {index ? ' · ' : ''}
                            <span className="font-mono">{point.dp}</span> {point.label}
                          </span>
                        ))}
                      </p>
                    ) : null}
                  </section>
                )
              })}
              {blockFooters?.[block]}
            </section>
          ))}
          {end}
        </div>
      </div>
    </div>
  )
}
