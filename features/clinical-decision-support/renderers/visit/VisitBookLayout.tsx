"use client"

import { Fragment, useContext, useState, type ReactNode } from 'react'
import { Noto_Serif_TC } from 'next/font/google'
import { toast } from 'sonner'
import { useCopyToClipboard } from '@/src/shared/hooks/use-copy-to-clipboard'
import {
  ABSENT_STATES,
  BLOCK_ORDER,
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
import { VisitBookChromeContext } from './visit-book-chrome'
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

/**
 * The prototype's heading face, served by the app itself — the page's
 * font-src is 'self', so a stylesheet from Google would never load (owner
 * decision 2026-09-30, option A). Bold only, not preloaded: the browser
 * fetches only the slices the headings use (about 0.5 MB, once, then cached);
 * until then the headings read in the system serif.
 */
const bookSerif = Noto_Serif_TC({
  weight: '700',
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--book-serif',
  fallback: ['Songti TC', 'PMingLiU', 'serif'],
})

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
  /** The pack's chapters (`VisitDecisionModel.book`); without them, the map's groups. */
  chapters?: readonly BookChapterView[]
  /** Today's decisions, each with its point and what to recheck, for 今天的計畫. */
  decided: readonly { key: string; dp: string; source: string; label: string; check?: string }[]
  /** The note 複製到病歷 copies. */
  summaryText: string
}

/** A chapter as the model carries it (`VisitBookChapter`), read defensively. */
export interface BookChapterView {
  id: string
  title: string
  short: string
  aside?: string
  settled?: boolean
  plan?: boolean
  dps: readonly string[]
}

/** The model's chapters, where the pack gives them; undefined for an older pack. */
export function bookChaptersOf(model: object): BookChapterView[] | undefined {
  const raw = (model as { book?: unknown }).book
  if (!Array.isArray(raw)) return undefined
  const chapters = raw.flatMap((item): BookChapterView[] => {
    const { id, title, short, aside, settled, plan, dps } = (item ?? {}) as Record<string, unknown>
    if (typeof id !== 'string' || typeof title !== 'string' || !Array.isArray(dps)) return []
    return [{
      id,
      title,
      short: typeof short === 'string' ? short : title,
      ...(typeof aside === 'string' ? { aside } : {}),
      ...(settled === true ? { settled: true } : {}),
      ...(plan === true ? { plan: true } : {}),
      dps: dps.filter((dp): dp is string => typeof dp === 'string'),
    }]
  })
  return chapters.length ? chapters : undefined
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
  title: string
  short: string
  aside?: string
  settled?: boolean
  plan?: boolean
  /** The map group's block, where the section is one (no chapters from the pack). */
  block?: VisitBlock
  points: DecisionPointView[]
}

/**
 * The page's chapters: the pack's, each point of the page in the one that
 * names it and any the pack placed nowhere at the end; without them, the
 * map's groups by column, as the pack lists them.
 */
function sectionsOf(points: readonly DecisionPointView[], chapters: readonly BookChapterView[] | undefined, isEnglish: boolean): Section[] {
  if (chapters?.length) {
    const placed = new Set<DecisionPointView>()
    const sections: Section[] = chapters.map((chapter) => {
      const mine = chapter.dps.flatMap((dp) => points.filter((point) => point.dp === dp && !placed.has(point)))
      mine.forEach((point) => placed.add(point))
      return {
        key: chapter.id,
        title: chapter.title,
        short: chapter.short,
        ...(chapter.aside ? { aside: chapter.aside } : {}),
        ...(chapter.settled ? { settled: true } : {}),
        ...(chapter.plan ? { plan: true } : {}),
        points: mine,
      }
    })
    const rest = points.filter((point) => !placed.has(point))
    if (rest.length) sections.push({ key: 'other', title: isEnglish ? 'Other points' : '其他決策點', short: isEnglish ? 'Other' : '其他', points: rest })
    // The plan's points close the page, after every chapter.
    return [...sections.filter((section) => !section.plan), ...sections.filter((section) => section.plan)]
  }
  const sections: Section[] = []
  for (const block of BLOCK_ORDER) {
    for (const point of points.filter((candidate) => candidate.block === block)) {
      const key = `${block}|${point.group}`
      let section = sections.find((candidate) => candidate.key === key)
      if (!section) {
        const title = point.groupLabel ?? point.group
        section = { key, block, title, short: title, points: [] }
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

interface ClassificationView { title: string; classes: { id: string; label: string; definition: string; current?: boolean }[]; patient?: string; note?: string }

/** A point's classification table (HF DP-01's phenotype), read defensively like `changesOf`. */
function classificationOf(point: object | undefined): ClassificationView | undefined {
  const raw = (point as { classification?: unknown } | undefined)?.classification
  if (!raw || typeof raw !== 'object') return undefined
  const { title, classes, patient, note } = raw as Record<string, unknown>
  if (typeof title !== 'string' || !Array.isArray(classes)) return undefined
  const parsed = classes.flatMap((item): ClassificationView['classes'] => {
    const { id, label, definition, current } = (item ?? {}) as Record<string, unknown>
    if (typeof id !== 'string' || typeof label !== 'string' || typeof definition !== 'string') return []
    return [{ id, label, definition, ...(current === true ? { current: true } : {}) }]
  })
  if (!parsed.length) return undefined
  return { title, classes: parsed, ...(typeof patient === 'string' ? { patient } : {}), ...(typeof note === 'string' ? { note } : {}) }
}

/** The classes side by side, the patient's column marked, as the prototype's DP-01 table. */
function ClassificationTable({ point, isEnglish }: { point: DecisionPointView; isEnglish: boolean }) {
  const table = classificationOf(point)
  if (!table) return null
  const current = table.classes.find((item) => item.current)
  return (
    <div className={styles.classWrap} data-testid="cdss-book-classification">
      <div className={styles.optScroll}>
        <table className={styles.classTable} aria-label={table.title}>
          <thead>
            <tr>
              <th scope="col"><span className={styles.dpTag}>{point.dp}</span></th>
              {table.classes.map((item) => (
                <th key={item.id} scope="col" data-current={item.current || undefined}>
                  {item.label}{item.current ? (isEnglish ? ' ← this patient' : ' ← 本病人') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">{isEnglish ? 'Definition' : '定義'}</th>
              {table.classes.map((item) => <td key={item.id} data-current={item.current || undefined}>{item.definition}</td>)}
            </tr>
            {table.patient ? (
              <tr>
                <th scope="row">{isEnglish ? 'This patient' : '本病人'}</th>
                {current
                  ? table.classes.map((item) => <td key={item.id} data-current={item.current || undefined} className={item.current ? styles.classPatient : undefined}>{item.current ? table.patient : ''}</td>)
                  : <td colSpan={table.classes.length}>{table.patient}</td>}
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className={styles.classNote}>{table.title}{table.note ? `　${table.note}` : ''}</p>
    </div>
  )
}

/** The criteria, each with its value and the date the record line gave it. */
function Criteria({ point, basis, isEnglish, dated }: { point: DecisionPointView; basis: readonly DecisionBasisItem[]; isEnglish: boolean; dated?: boolean }) {
  const groups = criteriaOf(point)
  if (!groups.length) return null
  return (
    <div data-visit-criteria="">
      {groups.map((group) => (
        <div key={group.title} className={styles.critGroup} data-visit-criteria-group={group.title}>
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
  chapters,
  decided,
  summaryText,
}: VisitBookLayoutProps) {
  const chrome = useContext(VisitBookChromeContext)
  const [mapOpen, setMapOpen] = useState(true)
  const { copied, copy } = useCopyToClipboard()
  const sections = sectionsOf(points, chapters, isEnglish)
  // The guideline sources the page cites, numbered as they first appear; the
  // 指引怎麼說 cell carries its point's number, the foot of the page the list.
  const citations: string[] = []
  const citationOf = (point: DecisionPointView) => {
    const reference = point.guideline?.references[0]
    if (!reference || ABSENT_STATES.has(point.state)) return undefined
    const cite = `${reference.source} §${reference.section}（p.${reference.page}）`
    if (!citations.includes(cite)) citations.push(cite)
    return citations.indexOf(cite) + 1
  }
  const onCopy = async () => {
    const ok = await copy(summaryText)
    if (!ok) toast.error(isEnglish ? 'Could not copy — the clipboard is unavailable in this context.' : '無法複製，此環境無法使用剪貼簿。')
  }
  // Back to the page's own layout: the same address without the experiment.
  const exitHref = (() => {
    if (typeof window === 'undefined') return undefined
    const url = new URL(window.location.href)
    url.searchParams.delete('visit')
    return `${url.pathname}${url.search}${url.hash}`
  })()
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
    const cite = citationOf(point)
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
            {cite ? <sup className={styles.cite}>{cite}</sup> : null}
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
        {classificationOf(point) ? <div className={styles.rowExtras}><ClassificationTable point={point} isEnglish={isEnglish} /></div> : null}
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
    // Today's triage (HF DP-24, AF DP-00) is the red-flag strip at the head of its chapter.
    if (!by && /-triage$/.test(point.semanticId) && !extras && !panel) {
      return (
        <p
          key={`${point.source}:${point.dp}`}
          id={bookAnchor(point)}
          tabIndex={-1}
          className={styles.redFlag}
          data-book-dp={point.dp}
          data-book-mark={mark}
        >
          <span className={styles.dpTag}>{point.dp}</span>　<b>{point.label}</b>　
          <span className={mark === 'ask' ? styles.lineAsk : undefined}>{point.headline ?? point.label}</span>
          {point.why ? <span className={styles.redFlagWhy}>{point.why}</span> : null}
        </p>
      )
    }
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
        {classificationOf(point) ? <div className={styles.lineWide}><ClassificationTable point={point} isEnglish={isEnglish} /></div> : null}
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
      <ClassificationTable point={point} isEnglish={isEnglish} />
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
            <span>{['drugs', 'comorbidity'].includes(section.key) ? section.short : (isEnglish ? 'Decision' : '決策點')}</span>
            <span>{isEnglish ? 'This patient now' : '本病人現在'}</span>
            <span>{isEnglish ? 'The guideline says' : '指引怎麼說'}</span>
            <span>{isEnglish ? 'Today' : '今天'}</span>
          </div>
          {run.items.map(({ point, entry }) => (entry.kind === 'row' ? renderRow(point, entry.row, entry.queued) : null))}
        </div>
      )
    })
  }

  // Chapters numbered down the page as the map numbers them; today's plan
  // closes the page unnumbered. Without the pack's chapters, a group label's
  // own marker (AF's ⓪ ① and A／R／C) stands for the number.
  const chaptersOnly = sections.filter((section) => !section.plan)
  const numbered = sections.map((section) => {
    if (section.plan) return { section, num: '' }
    const count = chaptersOnly.indexOf(section) + 1
    const marked = chapters?.length ? null : /^([⓪①-⑳]|[A-Z])\s+(.+)$/u.exec(section.title)
    return marked
      ? { section: { ...section, title: marked[2]!, short: marked[2]! }, num: marked[1]! }
      : { section, num: String(count) }
  })
  const planSection = numbered.find(({ section }) => section.plan)?.section
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

  const mapLines = (section: Section) => (
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
  )

  const renderChapter = ({ section, num }: { section: Section; num: string }) => {
    const absent = section.points.filter((point) => ABSENT_STATES.has(point.state))
    return (
      <section
        key={section.key}
        id={sectionAnchor(section.key)}
        tabIndex={-1}
        className={`${styles.section} ${major(section) ? '' : styles.minor}`}
        aria-labelledby={`${sectionAnchor(section.key)}-title`}
        data-book-section={section.key}
      >
        <div className={styles.sectionHead}>
          <span className={styles.sectionNum}>{num}</span>
          <h2 id={`${sectionAnchor(section.key)}-title`} className={styles.sectionTitle}>{section.title}</h2>
          {section.aside ? <span className={section.settled ? styles.sectionSettled : styles.sectionAside}>{section.aside}</span> : null}
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
        {section.block && blockFooters?.[section.block] && numbered.filter((item) => item.section.block === section.block).at(-1)?.section === section
          ? <div className={styles.inner}>{blockFooters[section.block]}</div>
          : null}
      </section>
    )
  }

  const chaptersShown = numbered.filter(({ section }) => !section.plan)
  // With the pack's chapters, the columns' footers (the outlook models, the
  // timeline) follow the chapters, before the plan.
  const footers = chapters?.length ? BLOCK_ORDER.flatMap((block) => (blockFooters?.[block] ? [blockFooters[block]] : [])) : []

  return (
    <div className={`${styles.book} ${bookSerif.variable}`} data-testid="cdss-visit-book">
      <header className={styles.head}>
        <div className={styles.headInner}>
          {chrome?.tabs ? <div className={styles.tabs}>{chrome.tabs}</div> : null}
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
          {exitHref ? <a className={styles.exit} href={exitHref}>{isEnglish ? 'Original layout' : '回原版面'}</a> : null}
        </div>
      </header>

      <div className={`${styles.body} ${mapOpen ? '' : styles.bodyMapClosed}`}>
        {mapOpen ? (
          <nav aria-label={isEnglish ? 'Decision map' : '決策地圖'} className={styles.map} data-testid="cdss-book-map">
            <div className={styles.mapHead}>
              <span className={styles.mapTitle}>{isEnglish ? 'Decision map' : '決策地圖'}</span>
              <span className={styles.mapCount}>
                {isEnglish ? `${counted.length} DPs · ${pending.length + asking.length} open` : `${counted.length} 個 DP · ${pending.length + asking.length} 待處理`}
              </span>
              <button
                type="button"
                className={styles.mapToggle}
                onClick={() => setMapOpen(false)}
                aria-label={isEnglish ? 'Collapse the decision map' : '收合決策地圖'}
                title={isEnglish ? 'Collapse' : '收合'}
                data-testid="cdss-book-map-collapse"
              >
                ‹
              </button>
            </div>
            <div className={styles.legend} aria-hidden="true">
              {pending.some((point) => marks.get(point) === 'safety') ? <span><span className={styles.markSafety} />{isEnglish ? 'Safety' : '安全'}</span> : null}
              <span><span className={styles.markAct} />{isEnglish ? 'To decide' : '待決定'}</span>
              <span><span className={styles.markAsk} />{isEnglish ? 'To answer' : '待答'}</span>
              <span><svg className={styles.markDone} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>{isEnglish ? 'Settled' : '已定'}</span>
              <span><span className={styles.markInfo} />{isEnglish ? 'Info' : '資訊'}</span>
              <span className={styles.legendMuted}>{isEnglish ? 'Grey: not applicable' : '灰字 不適用'}</span>
            </div>
            {numbered.map(({ section, num }) => {
              const open = section.points.filter((point) => ['act', 'safety', 'ask'].includes(marks.get(point)!)).length
              return (
                <div key={section.key} className={styles.mapSection}>
                  <button type="button" className={styles.mapSectionHead} onClick={() => scrollTo(section.plan ? PLAN_ANCHOR : sectionAnchor(section.key))}>
                    {num ? <span className={styles.mapNum}>{num}</span> : null}
                    <span className={styles.mapName}>{section.short}</span>
                    {open ? <span className={styles.mapPending}>{isEnglish ? `${open} open` : `${open} 待`}</span> : null}
                  </button>
                  {mapLines(section)}
                </div>
              )
            })}
          </nav>
        ) : (
          <nav aria-label={isEnglish ? 'Decision map' : '決策地圖'} className={styles.mapRail} data-testid="cdss-book-map">
            <button
              type="button"
              className={styles.mapExpand}
              onClick={() => setMapOpen(true)}
              aria-label={isEnglish ? 'Open the decision map' : '展開決策地圖'}
              data-testid="cdss-book-map-expand"
            >
              <span className={styles.mapExpandArrow} aria-hidden="true">›</span>
              <span className={styles.mapExpandText}>{isEnglish ? 'Decision map' : '決策地圖'}</span>
              {pending.length + asking.length ? <span className={styles.mapPending}>{pending.length + asking.length}</span> : null}
            </button>
          </nav>
        )}

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
          {chaptersShown.map(renderChapter)}
          {footers.length ? <div className={`${styles.footers} ${styles.inner}`}>{footers.map((footer, index) => <Fragment key={index}>{footer}</Fragment>)}</div> : null}

          <section id={PLAN_ANCHOR} tabIndex={-1} className={styles.plan} aria-labelledby={`${PLAN_ANCHOR}-title`} data-testid="cdss-book-end">
            <div className={styles.planHead}>
              <h2 id={`${PLAN_ANCHOR}-title`} className={styles.planTitle}>{isEnglish ? "Today's plan" : '今天的計畫'}</h2>
              {planSection?.points.length ? (
                <span className={styles.planSub}>
                  {planSection.points.map((point) => `${point.dp} ${point.label}`).join(' · ')}
                </span>
              ) : null}
              <button type="button" className={styles.copy} onClick={onCopy} data-testid="cdss-visit-summary-copy">
                {copied ? (isEnglish ? 'Copied' : '已複製') : (isEnglish ? 'Copy to the note' : '複製到病歷')}
              </button>
            </div>
            {planSection ? renderSection(planSection) : null}
            {plan.notes.length ? (
              <ul className={styles.planList} data-testid="cdss-visit-plan-notes">
                {plan.notes.map((note) => <li key={note.text}><b>{note.text}</b></li>)}
              </ul>
            ) : null}
            {decided.length ? (
              <ol className={styles.planList} data-testid="cdss-visit-plan">
                {decided.map((item) => (
                  <li key={item.key} data-dp={item.dp} data-plan-item="">
                    <span className={styles.dpTag}>{item.source !== sourceOfPage ? `${item.source.toUpperCase()} ` : ''}{item.dp}</span>　<b>{item.label}</b>
                    {item.check ? <span className={styles.small}>　{item.check}</span> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.planEmpty} data-testid="cdss-visit-plan-empty">
                {isEnglish ? 'No decision recorded yet.' : '還沒有記錄任何決定。'}
              </p>
            )}
            {pending.length ? (
              <p className={styles.planPending}>
                <b>{isEnglish ? 'Not yet decided　' : '尚未決定　'}</b>
                {pending.map((point) => `${point.dp} ${point.label}`).join(' · ')}
              </p>
            ) : null}
            {decidedLine ? <p className={styles.question} data-testid="cdss-visit-decided-line">{decidedLine}</p> : null}
            <details className={styles.fold} data-testid="cdss-visit-summary">
              <summary>{isEnglish ? 'The text it copies' : '複製的病歷文字'}</summary>
              <p className={styles.summaryText} data-testid="cdss-visit-summary-text">{summaryText}</p>
            </details>
          </section>

          {citations.length ? (
            <footer className={styles.foot} data-testid="cdss-book-citations">
              <span>{citations.map((cite, index) => `${index + 1} ${cite}`).join('　')}</span>
            </footer>
          ) : null}
        </main>
      </div>
    </div>
  )
}
