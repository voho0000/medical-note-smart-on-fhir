"use client"

import { Fragment, type ReactNode } from 'react'
import {
  ABSENT_STATES,
  BLOCK_ORDER,
  blockShortTitle,
  checkIntervalSuffix,
  criteriaOf,
  sourceTag,
  type DecisionBasisItem,
  type QueueRow,
  type QueueStep,
  type VisitPlanModel,
} from './visit-decisions'
import { displayDate } from './VisitStatusHeader'
import type { DecisionPointView, VisitAction, VisitBlock, VisitDecisionModel } from '../../types'
import { ChainDone } from './TodayQueue'
import { VisitDecisionControls } from './VisitDecisionControls'
import styles from './VisitBookLayout.module.css'

/**
 * The visit laid out as a pocket-handbook page (owner request 2026-09-30,
 * after the Pocket Medicine-style prototype: 「把這個版面套到 localhost 上的
 * 真實 CDSS 試試看」, then 「我想要看到跟 prototype 一模一樣的畫面」). An
 * experiment beside the decision map, opened with `?visit=book`.
 *
 * Left, the decision map: every point of the page under its numbered section,
 * with a mark for where it stands today — the map says where the decisions
 * are. Right, one sheet in the map's order, each point once. A decision is a
 * table row — 本病人現在, 指引怎麼說, 今天 — with its buttons; a reminder is
 * one line. A point the clinician has to weigh carries 看依據: its criteria
 * with the values, what would change the answer, the guideline's points and
 * where they come from. At the foot, today's plan.
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
  /** The module cards behind a point, for the fold at the foot of 看依據. */
  moduleCardsOf: (point: DecisionPointView) => ReactNode
  onDecide?: (step: QueueStep, action: VisitAction, queued: boolean) => void
  onClear?: (step: QueueStep) => void
  basisOf: (point: DecisionPointView) => readonly DecisionBasisItem[]
  /** The page's inputs a point reads, drawn in view under it. */
  extrasOf: (point: DecisionPointView) => ReactNode
  /** The sentence for where the patient stands, and the values the decisions read. */
  headline: string
  keyValues: VisitDecisionModel['keyValues']
  triggers: VisitDecisionModel['triggers']
  now: Date
  onEditValues?: () => void
  /** Drawn at the head of the sheet: the values editor when open, the screen-reader status. */
  top?: ReactNode
  blockFooters?: Partial<Record<VisitBlock, ReactNode>>
  plan: VisitPlanModel
  /** The sentence once everything queued is recorded. */
  decidedLine?: string
  /** The copyable note. */
  summary: ReactNode
}

export function bookAnchor(point: Pick<DecisionPointView, 'source' | 'dp'>): string {
  return `cdss-book-${point.source}-${point.dp}`
}

const PLAN_ANCHOR = 'cdss-book-plan'

function Mark({ mark }: { mark: BookMark }) {
  return (
    <span className={styles.markSlot} aria-hidden="true">
      {mark === 'done' ? (
        <svg className={styles.markDone} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      ) : mark === 'act' ? <span className={styles.markAct} />
        : mark === 'safety' ? <span className={styles.markSafety} />
          : mark === 'ask' ? <span className={styles.markAsk} />
            : mark === 'info' ? <span className={styles.markInfo} />
              : null}
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

const sectionAnchor = (key: string) => `cdss-book-section-${key.replace(/[^a-z0-9-]/gi, '-')}`

/** 「什麼會改變答案」, read defensively: a pack older than the field has none. */
function changesOf(point: DecisionPointView): { when: string; then: string }[] {
  const raw = (point as { changesIf?: unknown }).changesIf
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const { when, then } = (item ?? {}) as { when?: unknown; then?: unknown }
    return typeof when === 'string' && typeof then === 'string' ? [{ when, then }] : []
  })
}

interface OptionRowView { name: string; standard?: string; patient: string; basis?: string; status?: string; current?: boolean }

/** Every option side by side (the DOACs at this patient's dose), read defensively like `changesOf`. */
function optionTableOf(point: object | undefined): { title: string; rows: OptionRowView[] } | undefined {
  const raw = (point as { optionTable?: unknown } | undefined)?.optionTable
  if (!raw || typeof raw !== 'object') return undefined
  const { title, rows } = raw as { title?: unknown; rows?: unknown }
  if (typeof title !== 'string' || !Array.isArray(rows)) return undefined
  const text = (value: unknown) => (typeof value === 'string' ? value : undefined)
  const parsed = rows.flatMap((row): OptionRowView[] => {
    const { name, standard, patient, basis, status, current } = (row ?? {}) as Record<string, unknown>
    if (typeof name !== 'string' || typeof patient !== 'string') return []
    return [{
      name,
      patient,
      ...(text(standard) ? { standard: text(standard) } : {}),
      ...(text(basis) ? { basis: text(basis) } : {}),
      ...(text(status) ? { status: text(status) } : {}),
      ...(current === true ? { current: true } : {}),
    }]
  })
  return parsed.length ? { title, rows: parsed } : undefined
}

interface StartDoseRowView { name: string; dose: string; role: string; when: string; proposed?: boolean }

/** 起始劑量怎麼選, read defensively like `changesOf`. */
function startDosesOf(point: object | undefined): { title: string; values?: string; rows: StartDoseRowView[] } | undefined {
  const raw = (point as { startDoses?: unknown } | undefined)?.startDoses
  if (!raw || typeof raw !== 'object') return undefined
  const { title, values, rows } = raw as { title?: unknown; values?: unknown; rows?: unknown }
  if (typeof title !== 'string' || !Array.isArray(rows)) return undefined
  const parsed = rows.flatMap((row): StartDoseRowView[] => {
    const { name, dose, role, when, proposed } = (row ?? {}) as Record<string, unknown>
    if (typeof name !== 'string' || typeof dose !== 'string' || typeof when !== 'string') return []
    return [{ name, dose, when, role: typeof role === 'string' ? role : 'start', ...(proposed === true ? { proposed: true } : {}) }]
  })
  return parsed.length ? { title, ...(typeof values === 'string' ? { values } : {}), rows: parsed } : undefined
}

/** The criteria, each with its value and the date the record line gave it. */
function Criteria({ point, basis, isEnglish, dated }: { point: DecisionPointView; basis: readonly DecisionBasisItem[]; isEnglish: boolean; dated?: boolean }) {
  const groups = criteriaOf(point)
  if (!groups.length) return null
  return (
    <div data-visit-criteria="">
      {groups.map((group) => (
        <div key={group.title} data-visit-criteria-group={group.title}>
          <p className={dated ? styles.panelLabel : styles.critTitle}>{group.title}</p>
          <ul className={dated ? styles.panelPlain : styles.critList}>
            {group.items.map((item) => {
              const state = item.met === true ? 'met' : item.met === false ? 'unmet' : 'unknown'
              const date = dated && item.value ? basis.find((value) => value.value === item.value)?.date : undefined
              return (
                <li key={item.label} className={state === 'unmet' ? styles.unmet : state === 'unknown' ? styles.unknown : undefined}>
                  <span className={`${styles.critSymbol} ${styles[state]}`} aria-hidden="true">{state === 'met' ? '✓' : state === 'unmet' ? '✗' : '？'}</span>
                  <span className="sr-only">{state === 'met' ? (isEnglish ? 'met: ' : '符合：') : state === 'unmet' ? (isEnglish ? 'not met: ' : '不符合：') : (isEnglish ? 'unknown: ' : '未知：')}</span>
                  {item.label}
                  {item.value ? <>　<b>{item.value}</b></> : state === 'unknown' ? <>　{isEnglish ? 'not in the record, please confirm' : '紀錄未見，請確認'}</> : null}
                  {date ? <> <span className={styles.date}>{date}</span></> : null}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

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
  moduleCardsOf,
  onDecide,
  onClear,
  basisOf,
  extrasOf,
  headline,
  keyValues,
  triggers,
  now,
  onEditValues,
  top,
  blockFooters,
  plan,
  decidedLine,
  summary,
}: VisitBookLayoutProps) {
  const sections = sectionsOf(points)
  const scrollTo = (id: string) => {
    const target = document.getElementById(id)
    target?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
    target?.focus?.({ preventScroll: true })
  }
  const goTo = (point: DecisionPointView) => {
    const entry = entryOf(point)
    scrollTo(bookAnchor(entry.kind === 'skip' ? entry.anchorOf : point))
  }
  const marks = new Map(points.map((point) => [point, markOf(point)] as const))
  const pending = points.filter((point) => ['act', 'safety'].includes(marks.get(point)!))
  const asking = points.filter((point) => marks.get(point) === 'ask')
  const counted = points.filter((point) => marks.get(point) !== 'absent')

  const reasoningButton = (point: DecisionPointView) => {
    if (!isComplex(point)) return null
    const open = openKey === openKeyOf(point)
    return (
      <button
        type="button"
        className={styles.whyPill}
        aria-expanded={open}
        onClick={() => onToggle(point)}
        data-book-reasoning={point.dp}
      >
        {open ? (isEnglish ? 'Hide reasoning' : '收起依據') : (isEnglish ? 'Reasoning ▸' : '看依據 ▸')}
      </button>
    )
  }

  /** 看依據: what the decision turns on, what would change it, the guideline, the sources. */
  const reasoning = (head: DecisionPointView, shown: DecisionPointView) => {
    if (openKey !== openKeyOf(head)) return null
    const changes = changesOf(shown).length ? changesOf(shown) : changesOf(head)
    const guideline = head.guideline
    const basis = basisOf(shown)
    const nextOptions = shown === head && head.next ? criteriaOf(head.next) : []
    // The options side by side: the step's own, else the step the row walks
    // on to (an older pack copies no table onto the step), else the row's.
    const table = optionTableOf(shown) ?? optionTableOf(head.next) ?? optionTableOf(head)
    const startDoses = startDosesOf(shown) ?? startDosesOf(head)
    return (
      <div className={styles.panel} data-testid="cdss-book-reasoning" data-dp={head.dp}>
        <div className={styles.panelHead}>
          <span className={styles.dpTag}>{head.dp}</span>
          <b>{isEnglish ? `${head.label}: reasoning` : `${head.label}：依據`}</b>
          <button type="button" className={styles.whyEnd} onClick={() => onToggle(head)}>{isEnglish ? 'Hide reasoning' : '收起依據'}</button>
        </div>
        {criteriaOf(shown).length ? <Criteria point={shown} basis={basis} isEnglish={isEnglish} dated /> : basis.length ? (
          <div>
            <span className={styles.panelLabel}>{isEnglish ? 'This patient (record)' : '本病人（紀錄）'}</span>
            <ul className={styles.panelPlain}>
              {basis.map((item) => (
                <li key={`${item.label}|${item.value}`}>{item.label}　<b>{item.value}</b>{item.date ? <> <span className={styles.date}>{item.date}</span></> : null}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {nextOptions.length ? (
          <div>
            <span className={styles.panelLabel}>{isEnglish ? `Next: ${head.next!.headline}` : `下一步：${head.next!.headline}`}</span>
            <Criteria point={head.next as unknown as DecisionPointView} basis={basis} isEnglish={isEnglish} dated />
          </div>
        ) : null}
        {startDoses ? (
          <div data-testid="cdss-book-start-doses">
            <span className={styles.panelLabel}>
              {startDoses.title}
              {startDoses.values ? <span className={styles.panelValues}>{isEnglish ? `　This patient: ${startDoses.values}` : `　本病人：${startDoses.values}`}</span> : null}
            </span>
            <div className={styles.optScroll}>
              <table className={styles.optTable}>
                <thead>
                  <tr>
                    <th scope="col">{isEnglish ? 'Agent' : '藥'}</th>
                    <th scope="col">{isEnglish ? 'Dose' : '劑量'}</th>
                    <th scope="col">{isEnglish ? 'When' : '何時用'}</th>
                  </tr>
                </thead>
                <tbody>
                  {startDoses.rows.map((row, index) => (
                    <tr key={`${row.name}|${row.dose}|${row.role}`} data-proposed={row.proposed || undefined} data-role={row.role}>
                      <td>{index === 0 || startDoses.rows[index - 1]!.name !== row.name ? <b>{row.name}</b> : null}</td>
                      <td className={styles.optPatient}>{row.dose}</td>
                      <td>{row.when}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
        {table ? (
          <div data-testid="cdss-book-option-table">
            <span className={styles.panelLabel}>{table.title}</span>
            <div className={styles.optScroll}>
              <table className={styles.optTable}>
                <thead>
                  <tr>
                    <th scope="col">{isEnglish ? 'Agent' : '藥'}</th>
                    <th scope="col">{isEnglish ? 'Usual' : '標準'}</th>
                    <th scope="col">{isEnglish ? 'This patient' : '本病人'}</th>
                    <th scope="col">{isEnglish ? 'Why' : '依據'}</th>
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row) => (
                    <tr key={row.name} data-current={row.current || undefined} data-status={row.status}>
                      <td><b>{row.name}</b>{row.current ? (isEnglish ? ' ← prescribed' : ' ← 現用') : ''}</td>
                      <td>{row.standard ?? '—'}</td>
                      <td className={styles.optPatient}>{row.patient}</td>
                      <td>{row.basis ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
        {changes.length ? (
          <div data-testid="cdss-book-changes-if">
            <span className={styles.panelLabel}>{isEnglish ? 'What would change the answer' : '什麼會改變答案'}</span>
            <ul className={styles.panelList}>
              {changes.map((change) => <li key={change.when}>{change.when} → {change.then}</li>)}
            </ul>
          </div>
        ) : null}
        {guideline?.points.length ? (
          <div data-testid="cdss-book-guideline-points">
            <span className={styles.panelLabel}>{isEnglish ? 'Guideline points' : '指引重點'}</span>
            <ul className={styles.panelList}>
              {guideline.points.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        ) : null}
        {guideline?.references.length ? (
          <p className={styles.sources}>
            {isEnglish ? 'Sources: ' : '出處：'}
            {guideline.references
              .map((reference) => `${reference.source} §${reference.section}（p.${reference.page}${reference.recommendation ? `，${reference.recommendation.class} ${reference.recommendation.level}` : ''}）`)
              .filter((text, index, all) => all.indexOf(text) === index)
              .join(' · ')}
          </p>
        ) : null}
        <details className={styles.fold}>
          <summary>{isEnglish ? 'Quotes and the full cards' : '原文與完整卡片'}</summary>
          {guideline?.references.length ? (
            <ol className={styles.panelPlain}>
              {guideline.references.map((reference) => (
                <li key={`${reference.source}|${reference.section}|${reference.page}|${reference.quote}`} className={styles.quote}>
                  {reference.source} §{reference.section} · p.{reference.page}：<span lang="en">“{reference.quote}”</span>
                </li>
              ))}
            </ol>
          ) : null}
          <div className={styles.inner}>{moduleCardsOf(head)}</div>
        </details>
      </div>
    )
  }

  const nameCell = (point: DecisionPointView) => (
    <div>
      <span className={styles.dpTag}>{point.dp}</span>
      {point.source !== sourceOfPage ? <span className={styles.fromTag}>{sourceTag(point)}</span> : null}
      <br />
      <b>{point.label}</b>
      <span className="sr-only">{isEnglish ? MARK_WORDS[marks.get(point)!].en : MARK_WORDS[marks.get(point)!].zh}</span>
      <br />
      {reasoningButton(point)}
    </div>
  )

  /** A decision: 決策點 | 本病人現在 | 指引怎麼說 | 今天, and under it what the row reads and 看依據. */
  const renderRow = (point: DecisionPointView, row: QueueRow, queued: boolean) => {
    const mark = marks.get(point)!
    const current = row.current
    const shown = (current ?? row.steps[row.steps.length - 1]).point
    const decided = row.steps.filter((step) => step.decision)
    const criteria = criteriaOf(shown)
    const basis = basisOf(shown)
    const guide = point.guideline?.points[0]
    // 本病人現在: the values the row reads; beside criteria, the reason line.
    const nowCell = criteria.length || !basis.length
      ? (shown.why ? <span>{shown.why}</span> : <span className={styles.cellMuted}>—</span>)
      : (
        <ul className={styles.basisList}>
          {basis.map((item) => (
            <li key={`${item.label}|${item.value}`}>{item.label} <b>{item.value}</b>{item.date ? <span className={styles.date}>（{item.date}）</span> : null}</li>
          ))}
        </ul>
      )
    const tone = current && (mark === 'act' || mark === 'safety') ? (row.safety ? 'safety' : 'act') : undefined
    return (
      <div
        key={`${point.source}:${point.dp}`}
        id={bookAnchor(point)}
        tabIndex={-1}
        className={styles.entry}
        data-tone={tone}
        data-book-dp={point.dp}
        data-book-mark={mark}
      >
        <div className={styles.rowCells}>
          {nameCell(point)}
          <div>{nowCell}</div>
          <div className={styles.cellGuide}>
            {criteria.length > 1 ? (
              // Several options (the four DOACs): one line each here, each
              // criterion under 看依據.
              <>
                <ul className={styles.critList}>
                  {criteria.map((group) => <li key={group.title}>{group.title}</li>)}
                </ul>
                {isComplex(point) ? <span className={styles.small}>{isEnglish ? 'Each criterion under Reasoning' : '逐項條件見看依據'}</span> : null}
              </>
            ) : criteria.length ? <Criteria point={shown} basis={basis} isEnglish={isEnglish} /> : guide ?? <span className={styles.cellMuted}>—</span>}
          </div>
          <div className={styles.inner}>
            {current ? (
              <>
                <ChainDone steps={decided} />
                <p className={styles.question} data-visit-headline="">{shown.headline ?? shown.label}</p>
                {!(criteria.length || !basis.length) && shown.why ? <p className={styles.why} data-visit-why="">{shown.why}</p> : null}
                <VisitDecisionControls
                  point={shown}
                  surface="queue"
                  isEnglish={isEnglish}
                  onDecide={onDecide ? (action) => onDecide(current, action, queued) : undefined}
                />
              </>
            ) : (
              <>
                <ChainDone steps={decided.slice(0, -1)} />
                <VisitDecisionControls
                  point={shown}
                  decision={row.steps[row.steps.length - 1].decision}
                  surface="queue"
                  isEnglish={isEnglish}
                  onClear={onClear ? () => onClear(row.steps[row.steps.length - 1]) : undefined}
                />
              </>
            )}
          </div>
        </div>
        {extrasOf(point) ? <div className={`${styles.rowExtras} ${styles.inner}`}>{extrasOf(point)}</div> : null}
        {reasoning(point, shown)}
      </div>
    )
  }

  /** A reminder: DP | name | one line; covered points say by which. */
  const renderLine = (point: DecisionPointView, by?: DecisionPointView) => {
    const mark = marks.get(point)!
    const extras = extrasOf(point)
    const panel = reasoning(point, point)
    return (
      <div
        key={`${point.source}:${point.dp}`}
        id={bookAnchor(point)}
        tabIndex={-1}
        className={styles.line}
        data-book-dp={point.dp}
        data-book-mark={mark}
      >
        <span className={styles.dpTag}>{point.dp}</span>
        <b>
          {point.label}
          {point.source !== sourceOfPage ? <span className={styles.fromTag}>{sourceTag(point)}</span> : null}
        </b>
        <span className={`${styles.lineText} ${mark === 'ask' ? styles.lineAsk : ''}`}>
          <span className="sr-only">{isEnglish ? MARK_WORDS[mark].en : MARK_WORDS[mark].zh}：</span>
          {by
            ? <>{isEnglish ? `Decided with ${by.dp} ${by.label}` : `與 ${by.dp} ${by.label} 一起決定`}{point.headline ? ` · ${point.headline}` : ''}</>
            : point.headline ?? point.label}
          {!by && point.why ? <span className={styles.lineWhy}>{point.why}</span> : null}
          {reasoningButton(point)}
        </span>
        {extras ? <div className={`${styles.lineWide} ${styles.inner}`}>{extras}</div> : null}
        {panel ? <div className={styles.lineWide}>{panel}</div> : null}
      </div>
    )
  }

  const renderSlot = (point: DecisionPointView, content: ReactNode) => (
    <div
      key={`${point.source}:${point.dp}`}
      id={bookAnchor(point)}
      tabIndex={-1}
      className={styles.slot}
      data-book-dp={point.dp}
      data-book-mark={marks.get(point)}
    >
      <div className={styles.slotHead}>
        <span className={styles.dpTag}>{point.dp}</span>
        <b>{point.label}</b>
      </div>
      <div className={styles.inner}>
        {content}
        {extrasOf(point)}
      </div>
    </div>
  )

  /** A section's present points, consecutive rows in one table, consecutive lines in one list. */
  const renderSection = (section: Section) => {
    const present = section.points.filter((point) => !ABSENT_STATES.has(point.state))
    const runs: { kind: 'table' | 'lines' | 'slot'; items: { point: DecisionPointView; entry: BookEntry }[] }[] = []
    for (const point of present) {
      const entry = entryOf(point)
      if (entry.kind === 'skip') continue
      const kind = entry.kind === 'row' ? 'table' : entry.kind === 'slot' ? 'slot' : 'lines'
      const last = runs[runs.length - 1]
      if (last && last.kind === kind && kind !== 'slot') last.items.push({ point, entry })
      else runs.push({ kind, items: [{ point, entry }] })
    }
    return runs.map((run, index) => {
      if (run.kind === 'slot') {
        const { point, entry } = run.items[0]
        return entry.kind === 'slot' ? <Fragment key={`slot-${index}`}>{renderSlot(point, entry.content)}</Fragment> : null
      }
      if (run.kind === 'lines') {
        return (
          <div key={`lines-${index}`} className={styles.lines}>
            {run.items.map(({ point, entry }) => renderLine(point, entry.kind === 'covered' ? entry.by : undefined))}
          </div>
        )
      }
      return (
        <div key={`table-${index}`} className={styles.table} role="group" aria-label={section.title}>
          <div className={styles.thead} aria-hidden="true">
            <span>{isEnglish ? 'Decision' : '決策點'}</span>
            <span>{isEnglish ? 'This patient now' : '本病人現在'}</span>
            <span>{isEnglish ? 'The guideline says' : '指引怎麼說'}</span>
            <span>{isEnglish ? 'Today' : '今天'}</span>
          </div>
          {run.items.map(({ point, entry }) => (entry.kind === 'row' ? renderRow(point, entry.row, entry.queued) : null))}
        </div>
      )
    })
  }

  // Sections numbered down the page, as the map numbers them — or by the
  // pack's own marker where its label carries one (AF's ⓪ ① and A／R／C).
  const numbered = sections.map((section, index) => {
    const marked = /^([⓪①-⑳]|[A-Z])\s+(.+)$/u.exec(section.title)
    return marked
      ? { section: { ...section, title: marked[2] }, num: marked[1] }
      : { section, num: String(index + 1) }
  })
  const major = (section: Section) => section.points.some((point) => {
    if (ABSENT_STATES.has(point.state)) return false
    const kind = entryOf(point).kind
    return kind === 'row' || kind === 'slot'
  })

  // The values the decisions read, by date, as the header's second line.
  const byDate = new Map<string, VisitDecisionModel['keyValues']>()
  for (const item of keyValues) {
    if (!item.value.trim() || /^[—–-]+$/.test(item.value.trim())) continue
    const date = displayDate(item.date, now) ?? ''
    byDate.set(date, [...(byDate.get(date) ?? []), item])
  }

  return (
    <div className={styles.book} data-testid="cdss-visit-book">
      <header className={styles.head}>
        <div className={styles.headInner}>
          <div className={styles.headText}>
            <span className={styles.headLine}>{headline}</span>
            <span className={styles.headValues} data-testid="cdss-book-values">
              {[...byDate.entries()].map(([date, items], index) => (
                <Fragment key={date || 'undated'}>
                  {index ? ' ｜ ' : ''}
                  {date ? `${date} ` : ''}
                  {items.map((item, itemIndex) => (
                    <Fragment key={item.key}>
                      {itemIndex ? ' · ' : ''}
                      {item.label} <b className={item.alert ? styles.alert : undefined}>{item.value}</b>
                      {item.abnormal ? (item.abnormal === 'high' ? (isEnglish ? ' H' : ' 高') : (isEnglish ? ' L' : ' 低')) : ''}
                      {item.trend === 'up' ? '↑' : item.trend === 'down' ? '↓' : ''}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
              {onEditValues ? (
                <button type="button" className={styles.headEdit} onClick={onEditValues}>{isEnglish ? 'Add or correct' : '補填／修改'}</button>
              ) : null}
            </span>
          </div>
          <button type="button" className={pending.length ? styles.pending : styles.pendingDone} onClick={() => scrollTo(PLAN_ANCHOR)} data-testid="cdss-book-pending">
            {pending.length
              ? (isEnglish ? `${pending.length} to decide today` : `今天待決定 ${pending.length}`)
              : asking.length
                ? (isEnglish ? `${asking.length} to answer` : `待答 ${asking.length}`)
                : (isEnglish ? 'Every decision recorded' : '今天的決定都記下了')}
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <nav aria-label={isEnglish ? 'Decision map' : '決策地圖'} className={styles.map} data-testid="cdss-book-map">
          <div className={styles.mapHead}>
            <span className={styles.mapTitle}>{isEnglish ? 'Decision map' : '決策地圖'}</span>
            <span className={styles.mapCount}>
              {isEnglish ? `${counted.length} DPs · ${pending.length + asking.length} open` : `${counted.length} 個 DP · ${pending.length + asking.length} 待處理`}
            </span>
          </div>
          <div className={styles.legend} aria-hidden="true">
            {pending.some((point) => marks.get(point) === 'safety') ? <span><span className={styles.markSafety} />{isEnglish ? 'Safety' : '安全'}</span> : null}
            <span><span className={styles.markAct} />{isEnglish ? 'To decide' : '待決定'}</span>
            <span><span className={styles.markAsk} />{isEnglish ? 'To answer' : '待答'}</span>
            <span><svg className={styles.markDone} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>{isEnglish ? 'Settled' : '已定'}</span>
            <span><span className={styles.markInfo} />{isEnglish ? 'Info' : '資訊'}</span>
            <span className={styles.legendMuted}>{isEnglish ? 'Grey: not applicable' : '灰字 不適用'}</span>
          </div>
          {numbered.map(({ section, num }, index) => {
            const open = section.points.filter((point) => ['act', 'safety', 'ask'].includes(marks.get(point)!)).length
            return (
              <div key={section.key} className={styles.mapSection}>
                {index === 0 || numbered[index - 1].section.block !== section.block ? (
                  <p className={styles.mapBlock}>{blockShortTitle(section.block, isEnglish)}</p>
                ) : null}
                <button type="button" className={styles.mapSectionHead} onClick={() => scrollTo(sectionAnchor(section.key))}>
                  <span className={styles.mapNum}>{num}</span>
                  <span className={styles.mapName}>{section.title}</span>
                  {open ? <span className={styles.mapPending}>{isEnglish ? `${open} open` : `${open} 待`}</span> : null}
                </button>
                <ul className={styles.mapLines}>
                  {section.points.map((point) => {
                    const mark = marks.get(point)!
                    const note = mark === 'act' || mark === 'safety'
                      ? MARK_WORDS[mark]
                      : mark === 'ask'
                        ? MARK_WORDS.ask
                        : mark === 'absent'
                          ? (point.state === 'not-included' ? { zh: '未納入', en: 'Not covered' } : MARK_WORDS.absent)
                          : undefined
                    return (
                      <li key={`${point.source}:${point.dp}`}>
                        <button
                          type="button"
                          className={styles.mapLine}
                          onClick={() => goTo(point)}
                          data-book-map-dp={point.dp}
                          data-book-mark={mark}
                        >
                          <Mark mark={mark} />
                          <span className={styles.mapDp}>{point.dp}</span>
                          <span className={styles.mapLabel}>{point.label}</span>
                          {note ? <span className={styles.mapNote}>{isEnglish ? note.en : note.zh}</span> : <span className="sr-only">{isEnglish ? MARK_WORDS[mark].en : MARK_WORDS[mark].zh}</span>}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </nav>

        <main className={styles.sheet} aria-label={isEnglish ? 'The visit' : '本次門診'}>
          {top ? <div className={styles.inner}>{top}</div> : null}
          {triggers.length ? (
            <p className={styles.triggers} data-testid="cdss-visit-triggers">
              <b>{isEnglish ? 'Reassessment opened by: ' : '重新評估的原因：'}</b>
              {triggers.map((trigger, index) => (
                <span key={trigger.id} data-trigger={trigger.id}>{index ? (isEnglish ? '; ' : '；') : ''}{trigger.text}</span>
              ))}
            </p>
          ) : null}
          {BLOCK_ORDER.map((block) => (
            <Fragment key={block}>
              {numbered.filter(({ section }) => section.block === block).map(({ section, num }, index) => {
                const absent = section.points.filter((point) => ABSENT_STATES.has(point.state))
                return (
                  <section
                    key={section.key}
                    id={sectionAnchor(section.key)}
                    tabIndex={-1}
                    className={`${styles.section} ${major(section) ? '' : styles.minor}`}
                    aria-labelledby={`${sectionAnchor(section.key)}-title`}
                    data-book-section={section.key}
                    data-book-block={block}
                  >
                    <div className={styles.sectionHead}>
                      <span className={styles.sectionNum}>{num}</span>
                      <h2 id={`${sectionAnchor(section.key)}-title`} className={styles.sectionTitle}>{section.title}</h2>
                      {index === 0 ? <span className={styles.sectionAside}>{blockShortTitle(block, isEnglish)}</span> : null}
                    </div>
                    {renderSection(section)}
                    {absent.length ? (
                      <p className={styles.absent} data-book-absent={section.key}>
                        {isEnglish ? 'Not applicable　' : '不適用　'}
                        {absent.map((point, pointIndex) => (
                          <span key={`${point.source}:${point.dp}`} id={bookAnchor(point)} tabIndex={-1}>
                            {pointIndex ? ' · ' : ''}
                            <span className={styles.dpInline}>{point.dp}</span> {point.label}
                          </span>
                        ))}
                      </p>
                    ) : null}
                  </section>
                )
              })}
              {blockFooters?.[block] ? <div className={styles.inner}>{blockFooters[block]}</div> : null}
            </Fragment>
          ))}

          <section id={PLAN_ANCHOR} tabIndex={-1} className={styles.plan} aria-labelledby={`${PLAN_ANCHOR}-title`} data-testid="cdss-book-end">
            <div className={styles.planHead}>
              <h2 id={`${PLAN_ANCHOR}-title`} className={styles.planTitle}>{isEnglish ? "Today's plan" : '今天的計畫'}</h2>
            </div>
            {plan.notes.length ? (
              <ul className={styles.planList} data-testid="cdss-visit-plan-notes">
                {plan.notes.map((note) => <li key={note.text}><b>{note.text}</b></li>)}
              </ul>
            ) : null}
            {plan.items.length ? (
              <ol className={styles.planList} data-testid="cdss-visit-plan">
                {plan.items.map((item) => (
                  <li key={item.key} data-dp={item.point.dp} data-plan-item="">
                    <span className={styles.dpTag}>{item.point.dp}</span>　<b>{item.actionLabel}</b>
                    <span className={styles.small}>{isEnglish ? ' — ' : '：'}{item.check.text}{checkIntervalSuffix(item.check, isEnglish)}</span>
                    {item.reopenWhen ? <span className={styles.small}>{isEnglish ? ' Reopen when: ' : '　重新評估：'}{item.reopenWhen}</span> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.planEmpty} data-testid="cdss-visit-plan-empty">
                {isEnglish ? 'No decision recorded today asks for a follow-up check yet.' : '今天還沒有需要回應檢查的決定。'}
              </p>
            )}
            {pending.length ? (
              <p className={styles.planPending}>
                <b>{isEnglish ? 'Not yet decided　' : '尚未決定　'}</b>
                {pending.map((point) => `${point.dp} ${point.label}`).join(' · ')}
              </p>
            ) : null}
            {decidedLine ? <p className={styles.question} data-testid="cdss-visit-decided-line">{decidedLine}</p> : null}
            <div className={styles.inner}>{summary}</div>
          </section>
        </main>
      </div>
    </div>
  )
}
