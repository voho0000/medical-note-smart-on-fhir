'use client'

// Cumulative microbiology, read like the numeric cumulative report: dates are
// rows (newest first) and the clinical workflow is the columns — direct exam,
// culture/identification, susceptibility. One row is one collection event
// (date × specimen × organism family × hospital), so a culture and its
// susceptibility sit side by side and the timeline reads straight down.
// Narrative source text never enters the grid; selecting a row expands the
// full reports inline under it.

import { Fragment, useMemo, useState } from 'react'
import { CircleAlert } from 'lucide-react'
import { useLanguage } from '@/src/application/providers/language.provider'
import { TapTooltip } from '@/src/shared/components/TapTooltip'
import { formatReportText } from '@/src/shared/utils/report-text-format'
import { FormattedReportText } from './FormattedReportText'
import type { AnalyteNameMode } from '@voho0000/clinical-lab-normalization/display'
import {
  filterDatesByCumulativeRange,
  type CumulativeRangeId,
} from '../utils/cumulative-range.utils'
import {
  MICROBIOLOGY_STAGE_COLUMN_ORDER,
  buildMicrobiologyCumulativeModel,
  buildMicrobiologyEvents,
  extractSusceptibilityOrganism,
  isSmearContextResult,
  parseSusceptibilityFreeText,
  splitSusceptibilityResult,
  type SusceptibilityEntry,
  type SusceptibilityIsolate,
  type MicrobiologyCumulativeResult,
  type MicrobiologyEvent,
  type MicrobiologyFamily,
  type MicrobiologyResultState,
  type MicrobiologyStage,
  type MicrobiologyStageColumn,
} from '@/src/shared/utils/microbiology-cumulative.utils'

interface MicrobiologyCumulativeViewProps {
  observations: any[]
  nameMode: AnalyteNameMode
  fullHeight?: boolean
  /** 直式 (stacked) cumulative report: this grid is one section inside the
   *  page-level scroller, so it must not open a vertical scroller of its own
   *  and must not repeat a title the section heading already carries. */
  embedded?: boolean
  /** 顯示範圍 from the stacked toolbar. Applied to THIS view's own collection
   *  dates (it builds its event rows from the observations directly, not from
   *  the numeric pivot), so what it shows always matches what it counted.
   *  Undefined = every date. */
  range?: CumulativeRangeId
  /** Reference "today" for the calendar-window ranges; passed in so every
   *  section in one render compares against the same instant. */
  rangeToday?: Date
}

function formatDate(date: string): string {
  return date.length >= 10 ? `${date.slice(2, 4)}/${date.slice(5, 7)}/${date.slice(8, 10)}` : date
}

/** States whose value text needs an explicit state word in front of it. */
const PREFIXED_STATES: MicrobiologyResultState[] = ['detected', 'contaminated', 'pending']

function resultStateClass(state: MicrobiologyResultState): string {
  if (state === 'detected') return 'text-clinical-abnormal font-semibold'
  if (state === 'contaminated' || state === 'pending') {
    return 'text-amber-800 dark:text-amber-200'
  }
  if (state === 'noGrowth' || state === 'notDetected') return 'text-muted-foreground'
  return 'text-foreground'
}

function resultName(result: MicrobiologyCumulativeResult, nameMode: AnalyteNameMode): string {
  return nameMode === 'original' ? result.originalName : result.standardizedName
}

function secondaryResultName(result: MicrobiologyCumulativeResult, nameMode: AnalyteNameMode): string | null {
  const secondary = nameMode === 'original' ? result.standardizedName : result.originalName
  return secondary && secondary !== resultName(result, nameMode) ? secondary : null
}

/** `WBC (microscopy)` → `WBC`: the quality line repeats the grid context. */
function smearContextName(result: MicrobiologyCumulativeResult, nameMode: AnalyteNameMode): string {
  return resultName(result, nameMode).replace(/\s*[(（][^)）]*[)）]\s*$/, '')
}

interface CellNameGroup {
  name: string
  state: MicrobiologyResultState
  /** Distinct value texts; `count` marks verbatim duplicates (e.g. two sites). */
  values: { text: string; count: number }[]
}

/**
 * One line per source test inside a cell: the test name once, its values
 * joined — instead of one stacked block per Observation. Specimen-quality
 * items (WBC/epithelial) are pulled out into a single muted trailing line.
 */
function buildCellGroups(
  results: MicrobiologyCumulativeResult[],
  nameMode: AnalyteNameMode,
): { groups: CellNameGroup[]; quality: MicrobiologyCumulativeResult[] } {
  const groups: CellNameGroup[] = []
  const quality: MicrobiologyCumulativeResult[] = []
  for (const result of results) {
    if (isSmearContextResult(result)) {
      quality.push(result)
      continue
    }
    const name = resultName(result, nameMode)
    let group = groups.find((candidate) => candidate.name === name)
    if (!group) {
      group = { name, state: result.state, values: [] }
      groups.push(group)
    }
    const value = group.values.find((candidate) => candidate.text === result.value)
    if (value) value.count += 1
    else group.values.push({ text: result.value, count: 1 })
  }
  return { groups, quality }
}

/**
 * Group a panel by interpretation letter: R leads (resistance is what changes
 * management), then I, S, other verbatim letters; MIC-only values close the
 * list. Drugs keep their parenthesized MIC next to the name.
 */
const SUSCEPTIBILITY_GROUP_ORDER = ['R', 'I', 'S']
const MIC_GROUP = 'MIC'

function groupSusceptibilityEntries(
  entries: SusceptibilityEntry[],
): { result: string; antibiotics: string[] }[] {
  const byResult = new Map<string, string[]>()
  for (const entry of entries) {
    const { letter, detail } = splitSusceptibilityResult(entry.result)
    const key = letter ?? MIC_GROUP
    const label = letter
      ? (detail ? `${entry.antibiotic} (${detail})` : entry.antibiotic)
      : `${entry.antibiotic} ${detail}`
    const list = byResult.get(key) ?? []
    list.push(label)
    byResult.set(key, list)
  }
  const pick = (result: string) => (
    byResult.has(result) ? [{ result, antibiotics: byResult.get(result)! }] : []
  )
  const others = [...byResult.keys()]
    .filter((result) => !SUSCEPTIBILITY_GROUP_ORDER.includes(result) && result !== MIC_GROUP)
    .sort()
  return [
    ...SUSCEPTIBILITY_GROUP_ORDER.flatMap(pick),
    ...others.flatMap(pick),
    ...pick(MIC_GROUP),
  ]
}

/** `S 6 · I 4 · R 2 · N 1` — S/I first, R styled by the caller, rest verbatim. */
function susceptibilityCountParts(entries: SusceptibilityEntry[]): { result: string; count: number }[] {
  const groups = groupSusceptibilityEntries(entries)
  const order = ['S', 'I', 'R']
  return [
    ...order
      .map((result) => groups.find((group) => group.result === result))
      .filter((group): group is NonNullable<typeof group> => !!group),
    ...groups.filter((group) => !order.includes(group.result)),
  ].map((group) => ({ result: group.result, count: group.antibiotics.length }))
}

function isolateSummary(isolate: SusceptibilityIsolate): string {
  if (!isolate.organism) return ''
  return isolate.quantity ? `${isolate.organism} · ${isolate.quantity}` : isolate.organism
}

/**
 * Compact cell form of a free-text antibiogram: the grid keeps organisms and
 * quantities; the drug panels live in the expanded row.
 */
function antibiogramCellSummary(text: string): string {
  const parsed = parseSusceptibilityFreeText(text)
  const summaries = parsed?.isolates.map(isolateSummary).filter(Boolean) ?? []
  if (summaries.length > 0) return summaries.join(' · ')

  // A report may contain isolate identification but stop before the actual
  // drug rows. Keep the compact cell useful by showing only the source's own
  // ISOLATE lines; the full, formatted source remains in the expanded row.
  const isolateLines = formatReportText(text)
    .map((line) => line.text)
    .filter((line) => /^ISOLATE\s*\d+\s*[:：]/i.test(line))
  return isolateLines.length > 0 ? isolateLines.slice(0, 2).join(' · ') : text
}

function susceptibilityCounts(results: MicrobiologyCumulativeResult[]): { s: number; i: number; r: number } {
  const counts = { s: 0, i: 0, r: 0 }
  for (const result of results) {
    for (const item of result.susceptibilities) {
      if (item.result === 'S') counts.s += 1
      else if (item.result === 'I') counts.i += 1
      else counts.r += 1
    }
  }
  return counts
}

const MAX_CELL_GROUPS = 3

export function MicrobiologyCumulativeView({
  observations,
  nameMode,
  fullHeight = false,
  embedded = false,
  range,
  rangeToday,
}: MicrobiologyCumulativeViewProps) {
  const { t } = useLanguage()
  const strings = (t.reports as any).microbiologyCumulative ?? {}
  const model = useMemo(
    () => buildMicrobiologyCumulativeModel(observations),
    [observations],
  )
  const allEvents = useMemo(() => buildMicrobiologyEvents(model), [model])
  // Range filtering works on the DATE list, not the row list: one collection
  // date can carry several events (specimen × organism family), and the range
  // control counts dates.
  const events = useMemo(() => {
    if (!range) return allEvents
    const dates = [...new Set(allEvents.map((event) => event.date))]
      .sort((a, b) => b.localeCompare(a))
    const kept = new Set(filterDatesByCumulativeRange(dates, range, rangeToday ?? new Date()))
    return allEvents.filter((event) => kept.has(event.date))
  }, [allEvents, range, rangeToday])
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const columns = useMemo(
    () => MICROBIOLOGY_STAGE_COLUMN_ORDER.filter((column) => (
      events.some((event) => (event.resultsByColumn[column]?.length ?? 0) > 0)
    )),
    [events],
  )
  const dateCount = useMemo(() => new Set(events.map((event) => event.date)).size, [events])
  // Zebra striping follows the DATE group (not the row) so rows sharing one
  // collection date read as one block.
  const eventRows = useMemo(() => {
    const uniqueDates = [...new Set(events.map((event) => event.date))]
    return events.map((event, index) => ({
      event,
      isFirstOfDate: index === 0 || events[index - 1].date !== event.date,
      dateIndex: uniqueDates.indexOf(event.date),
    }))
  }, [events])

  const familyLabel = (family: MicrobiologyFamily): string => (
    strings.families?.[family] ?? family
  )
  const stageLabel = (stage: MicrobiologyStage): string => (
    strings.stages?.[stage] ?? stage
  )
  const columnLabel = (column: MicrobiologyStageColumn): string => (
    strings.columns?.[column] ?? column
  )
  const resultStateLabel = (state: MicrobiologyResultState): string => (
    strings.states?.[state] ?? state
  )
  const specimenCellLabel = (event: MicrobiologyEvent): string => (
    event.specimenConfidence === 'missing'
      ? (strings.specimenMissingShort ?? '未提供')
      : event.specimen
  )

  if (events.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        {t.reports.noData}
      </div>
    )
  }

  // Embedded in a stacked section the page owns vertical scrolling; standalone
  // (tabs layout) the grid keeps its own bounded scroller.
  const heightClass = embedded
    ? ''
    : fullHeight ? 'max-h-[calc(100vh-220px)]' : 'max-h-[60vh]'
  const detailColSpan = columns.length + 2

  const renderResultLine = (group: CellNameGroup) => {
    const joined = group.values
      .map((value) => {
        const text = antibiogramCellSummary(value.text)
        return value.count > 1
          ? `${text} ${(strings.duplicateCount ?? '×{count}').replace('{count}', String(value.count))}`
          : text
      })
      .join(' · ')
    return (
      <span key={group.name} className="line-clamp-2 break-words leading-snug">
        <span className="font-semibold text-foreground">{group.name}</span>
        <span aria-hidden="true" className="text-muted-foreground/60"> · </span>
        {PREFIXED_STATES.includes(group.state) && (
          <span className={resultStateClass(group.state)}>
            {resultStateLabel(group.state)}
            <span aria-hidden="true"> · </span>
          </span>
        )}
        <span className={resultStateClass(group.state)}>{joined}</span>
      </span>
    )
  }

  const renderCell = (event: MicrobiologyEvent, column: MicrobiologyStageColumn) => {
    const results = event.resultsByColumn[column] ?? []
    if (results.length === 0) {
      return (
        <td key={column} className="border-l px-2 py-1.5 align-top text-muted-foreground/60">
          <span className="sr-only">{strings.noResult ?? '無結果'}</span>
          <span aria-hidden="true">—</span>
        </td>
      )
    }

    if (column === 'susceptibility') {
      const counts = susceptibilityCounts(results)
      const organism = extractSusceptibilityOrganism(results[0].value)
      if (counts.s + counts.i + counts.r > 0) {
        return (
          <td key={column} className="border-l px-2 py-1.5 align-top">
            <div className="line-clamp-2 break-words font-medium leading-snug text-foreground">
              {organism ?? resultName(results[0], nameMode)}
            </div>
            <div className="mt-0.5 text-[0.6875rem] tabular-nums text-muted-foreground">
              {`S ${counts.s} · I ${counts.i} · `}
              <span className={counts.r > 0 ? 'font-semibold text-clinical-abnormal' : undefined}>
                {`R ${counts.r}`}
              </span>
            </div>
          </td>
        )
      }
      // NHI exports often flatten the whole antibiogram into one free-text
      // value: show each organism plus its per-letter counts; the expanded
      // row carries the full drug panels.
      const parsed = parseSusceptibilityFreeText(results[0].value)
      const isolates = parsed?.isolates.filter((isolate) => isolate.organism || isolate.entries.length > 0) ?? []
      if (isolates.length > 0 || organism) {
        return (
          <td key={column} className="border-l px-2 py-1.5 align-top">
            {isolates.length > 0 ? (
              <div className="flex flex-col gap-1">
                {isolates.slice(0, 2).map((isolate, index) => (
                  <div key={isolate.organism ?? index}>
                    <div className="line-clamp-1 break-words font-medium leading-snug text-foreground">
                      {isolate.organism ?? resultName(results[0], nameMode)}
                    </div>
                    {isolate.entries.length > 0 && (
                      <div className="mt-0.5 text-[0.6875rem] tabular-nums text-muted-foreground">
                        {susceptibilityCountParts(isolate.entries).map((part, partIndex) => (
                          <span key={part.result}>
                            {partIndex > 0 && ' · '}
                            <span className={part.result === 'R' ? 'font-semibold text-clinical-abnormal' : undefined}>
                              {`${part.result} ${part.count}`}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {isolates.length > 2 && (
                  <span className="text-[0.6875rem] text-muted-foreground">
                    {(strings.moreResults ?? '+{count} 項').replace('{count}', String(isolates.length - 2))}
                  </span>
                )}
              </div>
            ) : (
              <>
                <div className="line-clamp-1 break-words font-medium leading-snug text-foreground">
                  {organism}
                </div>
                <div className="mt-0.5 line-clamp-2 break-words text-[0.6875rem] leading-snug text-muted-foreground">
                  {results[0].value}
                </div>
              </>
            )}
          </td>
        )
      }
    }

    const { groups, quality } = buildCellGroups(results, nameMode)
    const shownGroups = groups.slice(0, MAX_CELL_GROUPS)
    const hiddenCount = groups.length - shownGroups.length
    return (
      <td key={column} className="border-l px-2 py-1.5 align-top">
        <div className="flex flex-col gap-0.5">
          {shownGroups.map(renderResultLine)}
          {hiddenCount > 0 && (
            <span className="text-[0.6875rem] text-muted-foreground">
              {(strings.moreResults ?? '+{count} 項').replace('{count}', String(hiddenCount))}
            </span>
          )}
          {quality.length > 0 && (
            <span className="line-clamp-1 break-words text-[0.6875rem] leading-snug text-muted-foreground">
              {quality
                .map((result) => `${smearContextName(result, nameMode)} ${result.value}`)
                .join(' · ')}
            </span>
          )}
        </div>
      </td>
    )
  }

  const renderDetailRow = (event: MicrobiologyEvent) => (
    <tr key={`${event.key}-detail`} className="bg-muted/20">
      <td colSpan={detailColSpan} className="border-t px-3 py-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
          <span className="font-semibold text-foreground">
            {formatDate(event.date)} · {specimenCellLabel(event)} · {familyLabel(event.family)}
          </span>
          {event.organization && (
            <span className="text-muted-foreground">{event.organization}</span>
          )}
          {event.specimenConfidence === 'inferred' && (
            <span className="text-muted-foreground">{strings.specimenInferred ?? '由報告資訊推定'}</span>
          )}
          {event.specimenConfidence === 'missing' && (
            <span className="text-amber-800 dark:text-amber-200">
              {strings.specimenMissing ?? '檢體未提供'}
            </span>
          )}
        </div>
        <div className="mt-1 divide-y divide-border">
          {event.results.map((result) => {
            const secondaryName = secondaryResultName(result, nameMode)
            return (
              <article key={result.id} className="grid gap-1 py-2 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-3">
                <div className="min-w-0 text-xs">
                  <div className="font-semibold text-foreground">{resultName(result, nameMode)}</div>
                  {secondaryName && (
                    <div className="mt-0.5 break-words text-muted-foreground">
                      {(strings.sourceName ?? '來源名稱：{name}').replace('{name}', secondaryName)}
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap gap-x-2 text-muted-foreground">
                    <span>{stageLabel(result.stage)}</span>
                    {result.sourceOrderCode && <span>{result.sourceOrderCode}</span>}
                  </div>
                  {result.sourceRoleConflict && (
                    <div className="mt-0.5 font-medium text-amber-700 dark:text-amber-300">
                      {strings.roleConflict ?? '來源名稱與結果內容不一致'}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className={`text-xs ${resultStateClass(result.state)}`}>
                    {resultStateLabel(result.state)}
                  </div>
                  {(() => {
                    // Free-text antibiograms are unreadable as one long line;
                    // lay them out as organism + an R/I/S-grouped panel. Every
                    // token stays verbatim; anything unparsed is shown as-is.
                    const parsed = result.susceptibilities.length === 0
                      ? parseSusceptibilityFreeText(result.value)
                      : null
                    const hasDistinctSource = result.sourceValue !== result.value
                    if (!parsed) {
                      return (
                        <div className="mt-0.5">
                          <FormattedReportText
                            text={result.sourceValue}
                            className="text-sm leading-relaxed text-foreground"
                          />
                          {hasDistinctSource && (
                            <details className="mt-2">
                              <summary className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                                {strings.viewOriginalReport ?? '查看原始報告'}
                              </summary>
                              <pre className="mt-1 max-w-full overflow-x-auto whitespace-pre rounded-md bg-muted/40 px-2 py-1.5 font-mono text-xs leading-relaxed text-foreground">{result.value}</pre>
                            </details>
                          )}
                        </div>
                      )
                    }
                    return (
                      <div className="mt-0.5">
                        {parsed.isolates.map((isolate, isolateIndex) => (
                          <div key={isolate.organism ?? isolateIndex} className={isolateIndex > 0 ? 'mt-2' : undefined}>
                            {(isolate.organism || isolate.quantity) && (
                              <div className="break-words text-sm leading-relaxed">
                                {isolate.organism && (
                                  <>
                                    <span className="text-xs text-muted-foreground">{strings.organismLabel ?? '菌名'} </span>
                                    <span className="font-medium text-foreground">{isolate.organism}</span>
                                  </>
                                )}
                                {isolate.quantity && (
                                  <span className="text-xs text-muted-foreground">
                                    {isolate.organism && <span aria-hidden="true"> · </span>}
                                    {strings.quantityLabel ?? '菌量'}{' '}
                                    <span className="text-sm text-foreground">{isolate.quantity}</span>
                                  </span>
                                )}
                              </div>
                            )}
                            {isolate.entries.length > 0 && (
                              <div className="mt-1.5 max-w-xl overflow-hidden rounded-md border">
                                <table className="w-full text-xs">
                                  <tbody className="divide-y divide-border">
                                    {groupSusceptibilityEntries(isolate.entries).map((group) => (
                                      <tr key={group.result}>
                                        <th scope="row" className="w-16 whitespace-nowrap bg-muted/40 px-2 py-1.5 text-left align-top">
                                          <span className={`font-semibold ${group.result === 'R' ? 'text-clinical-abnormal' : 'text-foreground'}`}>
                                            {group.result}
                                          </span>
                                          {strings.susceptibilityResults?.[group.result] && (
                                            <span className="ml-1 font-normal text-muted-foreground">
                                              {strings.susceptibilityResults[group.result]}
                                            </span>
                                          )}
                                        </th>
                                        <td className={`px-2 py-1.5 break-words leading-relaxed ${group.result === 'R' ? 'font-medium text-clinical-abnormal' : 'text-foreground'}`}>
                                          {group.antibiotics.join('、')}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        ))}
                        {parsed.leftover && (
                          <div className="mt-1 break-words text-xs text-muted-foreground">
                            {parsed.leftover}
                          </div>
                        )}
                        {hasDistinctSource && <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                            {strings.viewOriginalReport ?? strings.viewSourceText ?? '查看原始報告'}
                          </summary>
                          <pre className="mt-1 max-w-full overflow-x-auto whitespace-pre rounded-md bg-muted/40 px-2 py-1.5 font-mono text-xs leading-relaxed text-foreground">{result.value}</pre>
                        </details>}
                      </div>
                    )
                  })()}
                  {result.susceptibilities.length > 0 && (
                    <div className="mt-2 max-w-md overflow-hidden rounded-md border">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/70">
                          <tr>
                            <th className="px-2 py-1.5 text-left font-semibold">{strings.antibiotic ?? '抗生素'}</th>
                            <th className="px-2 py-1.5 text-left font-semibold">{strings.susceptibility ?? '藥敏'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {result.susceptibilities.map((item) => (
                            <tr key={`${item.antibiotic}-${item.result}`}>
                              <td className="px-2 py-1.5">{item.antibiotic}</td>
                              <td className={`px-2 py-1.5 font-semibold ${item.result === 'R' ? 'text-clinical-abnormal' : ''}`}>
                                {item.result}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </td>
    </tr>
  )

  return (
    <div
      data-testid="microbiology-cumulative-view"
      className={`flex w-full min-w-0 flex-col overflow-hidden rounded-md border bg-card ${heightClass}`}
    >
      {/* Embedded: the stacked section heading already names this panel and
          states its date count — a second title inside the card reads as a
          duplicate. */}
      {!embedded && (
        <div className="flex shrink-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b px-3 py-2">
          <h2 className="text-sm font-semibold text-foreground">
            {strings.title ?? '微生物累積結果'}
          </h2>
          <div className="text-xs tabular-nums text-muted-foreground">
            {(strings.resultCount ?? '{count} 筆結果').replace('{count}', String(model.resultCount))}
            <span aria-hidden="true"> · </span>
            {(strings.dateCount ?? '{count} 個日期').replace('{count}', String(dateCount))}
          </div>
        </div>
      )}

      <div
        role="region"
        aria-label={strings.matrixLabel ?? '微生物累積表，可水平捲動'}
        tabIndex={0}
        className={`min-h-0 w-full max-w-full overflow-x-auto ${embedded ? '' : 'overflow-y-auto'} outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-track]:bg-muted/30`}
        style={{ scrollbarWidth: 'thin' }}
      >
        {/* table-fixed so long narrative values wrap inside their workflow
            column instead of stretching the grid to max-content width. */}
        <table className="w-full min-w-[34rem] table-fixed border-collapse text-xs">
          {/* Root font-size is 12px, so rem widths shrink to 75% of textbook
              px — size the fixed identity columns in px with headroom: glyph
              metrics vary per machine, and an overflowing nowrap date paints
              over the specimen column. */}
          <colgroup>
            <col className="w-[76px]" />
            <col className="w-[84px]" />
            {columns.map((column) => <col key={column} />)}
          </colgroup>
          {/* Sticky only against this view's OWN scroller; embedded there is
              none, and sticking to the page would park the header over the
              next section. */}
          <thead className={embedded ? undefined : 'sticky top-0 z-20'}>
            <tr>
              <th className="sticky left-0 z-30 border-b border-r bg-muted px-2 py-1.5 text-left font-semibold">
                {strings.dateHeader ?? '日期'}
              </th>
              <th className="border-b bg-muted px-2 py-1.5 text-left font-semibold">
                <span className="inline-flex items-center gap-1">
                  {strings.specimenHeader ?? '檢體'}
                  {model.missingSpecimenCount > 0 && (
                    <TapTooltip
                      asChild
                      side="top"
                      content={strings.missingSpecimenWarning
                        ?? '健保署資料未提供檢體來源，無法判斷結果來自痰、尿液或其他檢體；同日結果也不一定屬於同一份檢體。'}
                    >
                      <button
                        type="button"
                        aria-label={strings.missingSpecimenWarning
                          ?? '健保署資料未提供檢體來源，無法判斷結果來自痰、尿液或其他檢體；同日結果也不一定屬於同一份檢體。'}
                        className="inline-flex size-6 items-center justify-center rounded-full text-amber-700 outline-none transition-colors hover:text-amber-900 focus-visible:ring-2 focus-visible:ring-primary dark:text-amber-300 dark:hover:text-amber-100"
                      >
                        <CircleAlert aria-hidden="true" className="size-3.5" />
                      </button>
                    </TapTooltip>
                  )}
                </span>
              </th>
              {columns.map((column) => (
                <th key={column} className="border-b border-l bg-muted px-2 py-1.5 text-left font-medium">
                  {columnLabel(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {eventRows.map(({ event, isFirstOfDate, dateIndex }) => {
              const zebra = dateIndex % 2 === 0 ? 'bg-card' : 'bg-muted/20'
              const isExpanded = expandedKey === event.key
              const toggle = () => setExpandedKey(isExpanded ? null : event.key)
              return (
                <Fragment key={event.key}>
                  <tr
                    className={`${zebra} cursor-pointer transition-colors hover:bg-primary/5 ${isExpanded ? '!bg-primary/10' : ''} ${isFirstOfDate ? 'border-t' : ''}`}
                    onClick={toggle}
                  >
                    <td className="sticky left-0 z-10 overflow-hidden border-r bg-card px-2 py-1.5 align-top font-medium tabular-nums">
                      {isFirstOfDate ? formatDate(event.date) : (
                        <span className="sr-only">{formatDate(event.date)}</span>
                      )}
                    </td>
                    <th scope="row" className="overflow-hidden px-0 py-0 text-left align-top font-normal">
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        aria-label={`${formatDate(event.date)} ${specimenCellLabel(event)} ${familyLabel(event.family)}${strings.expandDetail ? ` ${strings.expandDetail}` : ' 完整報告'}`}
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation()
                          toggle()
                        }}
                        className="flex min-h-full w-full flex-col items-start px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                      >
                        <span className={`w-full break-words font-medium ${event.specimenConfidence === 'missing' ? 'text-muted-foreground' : 'text-foreground'}`}>
                          {specimenCellLabel(event)}
                        </span>
                        <span className="w-full break-words text-[0.6875rem] text-muted-foreground">
                          {familyLabel(event.family)}
                          {event.specimenConfidence === 'inferred' && (
                            <> · {strings.specimenInferredShort ?? '推定'}</>
                          )}
                        </span>
                        {event.organization && (
                          <span className="max-w-full truncate text-[0.6875rem] text-muted-foreground/80" title={event.organization}>
                            {event.organization}
                          </span>
                        )}
                      </button>
                    </th>
                    {columns.map((column) => renderCell(event, column))}
                  </tr>
                  {isExpanded && renderDetailRow(event)}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
