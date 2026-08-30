'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, Microscope } from 'lucide-react'
import { useLanguage } from '@/src/application/providers/language.provider'
import type { AnalyteNameMode } from '@/src/shared/utils/lab-normalize'
import {
  buildMicrobiologyCumulativeModel,
  type MicrobiologyCumulativeResult,
  type MicrobiologyFamily,
  type MicrobiologyResultState,
  type MicrobiologyStage,
} from '@/src/shared/utils/microbiology-cumulative.utils'

interface MicrobiologyCumulativeViewProps {
  observations: any[]
  nameMode: AnalyteNameMode
  fullHeight?: boolean
}

interface SelectedCell {
  trackKey: string
  date: string
  stage: MicrobiologyStage
}

function formatDate(date: string): string {
  return date.length >= 10 ? `${date.slice(2, 4)}/${date.slice(5, 7)}/${date.slice(8, 10)}` : date
}

function resultBadgeClass(state: MicrobiologyResultState): string {
  if (state === 'detected') {
    return 'border-clinical-abnormal/30 bg-clinical-abnormal/10 text-clinical-abnormal'
  }
  if (state === 'pending') {
    return 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
  }
  return 'border-border bg-muted/70 text-foreground'
}

function primaryResultName(result: MicrobiologyCumulativeResult, nameMode: AnalyteNameMode): string {
  return nameMode === 'original' ? result.originalName : result.standardizedName
}

function secondaryResultName(result: MicrobiologyCumulativeResult, nameMode: AnalyteNameMode): string | null {
  const secondary = nameMode === 'original' ? result.standardizedName : result.originalName
  return secondary && secondary !== primaryResultName(result, nameMode) ? secondary : null
}

export function MicrobiologyCumulativeView({
  observations,
  nameMode,
  fullHeight = false,
}: MicrobiologyCumulativeViewProps) {
  const { t } = useLanguage()
  const strings = (t.reports as any).microbiologyCumulative ?? {}
  const model = useMemo(
    () => buildMicrobiologyCumulativeModel(observations),
    [observations],
  )
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null)

  const familyLabel = (family: MicrobiologyFamily): string => (
    strings.families?.[family] ?? family
  )
  const stageLabel = (stage: MicrobiologyStage): string => (
    strings.stages?.[stage] ?? stage
  )
  const resultStateLabel = (state: MicrobiologyResultState): string => (
    strings.states?.[state] ?? state
  )

  if (model.tracks.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        {t.reports.noData}
      </div>
    )
  }

  const maxHeight = fullHeight ? 'max-h-[calc(100vh-220px)]' : 'max-h-[60vh]'

  return (
    <div
      data-testid="microbiology-cumulative-view"
      className={`w-full min-w-0 overflow-y-auto rounded-md border ${maxHeight}`}
    >
      <div className="sticky top-0 z-30 flex flex-wrap items-start justify-between gap-2 border-b bg-card px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Microscope className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{strings.title ?? '依檢體與檢驗階段追蹤'}</span>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {strings.description ?? '同一檢體內比較鏡檢、培養、鑑定與藥敏；選取結果可查看完整原文。'}
          </p>
        </div>
        <div className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {(strings.resultCount ?? '{count} 筆結果').replace('{count}', String(model.resultCount))}
        </div>
      </div>

      <div className="divide-y divide-border">
        {model.tracks.map((track) => {
          const selected = selectedCell?.trackKey === track.key ? selectedCell : null
          const selectedResults = selected
            ? track.results.filter((result) => (
                result.date === selected.date && result.stage === selected.stage
              ))
            : []
          const specimenLabel = track.specimenConfidence === 'missing'
            ? (strings.specimenMissing ?? '檢體未提供')
            : track.specimen

          return (
            <section key={track.key} aria-labelledby={`microbiology-track-${track.key}`}>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-muted/30 px-3 py-2">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 id={`microbiology-track-${track.key}`} className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-sm font-semibold text-foreground">
                    <span>{specimenLabel}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {familyLabel(track.family)}
                    </span>
                  </h3>
                  {track.specimenConfidence === 'inferred' && (
                    <span className="inline-flex rounded border border-border bg-card px-1.5 py-0.5 text-xs text-muted-foreground">
                      {strings.specimenInferred ?? '由檢驗名稱推定'}
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {(strings.dateCount ?? '{count} 個日期').replace('{count}', String(track.dates.length))}
                </span>
              </div>

              {track.specimenConfidence === 'missing' && (
                <div className="flex items-start gap-1.5 border-y border-amber-200 bg-amber-50/60 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{strings.missingSpecimenWarning ?? '僅依檢驗階段與日期排列，不代表同一次感染事件。'}</span>
                </div>
              )}

              <div
                role="region"
                aria-label={`${specimenLabel} ${familyLabel(track.family)} ${strings.matrixLabel ?? '累積矩陣，可水平捲動'}`}
                tabIndex={0}
                className="max-w-full overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <table className="w-max min-w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-20 min-w-[7rem] border-b border-r bg-muted px-2 py-2 text-left font-semibold">
                        {strings.stageHeader ?? '檢驗階段'}
                      </th>
                      {track.dates.map((date) => (
                        <th
                          key={date}
                          className="min-w-[10rem] border-b border-r bg-muted/80 px-2 py-2 text-center font-semibold tabular-nums"
                        >
                          {formatDate(date)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {track.stages.map((stage, stageIndex) => (
                      <tr key={stage} className={stageIndex % 2 === 0 ? 'bg-card' : 'bg-muted/20'}>
                        <th className="sticky left-0 z-10 border-r bg-card px-2 py-2 text-left font-medium text-foreground">
                          {stageLabel(stage)}
                        </th>
                        {track.dates.map((date) => {
                          const results = track.results.filter((result) => (
                            result.date === date && result.stage === stage
                          ))
                          const isSelected = selected?.date === date && selected.stage === stage
                          if (results.length === 0) {
                            return (
                              <td
                                key={date}
                                aria-label={strings.noResult ?? '無結果'}
                                className="border-r bg-muted/40 px-2 py-3 text-center text-muted-foreground"
                                style={{ backgroundImage: 'var(--clinical-missing-data-pattern)' }}
                              >
                                <span className="sr-only">{strings.noResult ?? '無結果'}</span>
                                <span aria-hidden="true">—</span>
                              </td>
                            )
                          }
                          const first = results[0]
                          return (
                            <td key={date} className="border-r p-0 align-top">
                              <button
                                type="button"
                                aria-expanded={isSelected}
                                onClick={() => setSelectedCell(isSelected ? null : {
                                  trackKey: track.key,
                                  date,
                                  stage,
                                })}
                                className={`flex min-h-16 w-full min-w-[10rem] flex-col items-start gap-1 px-2 py-2 text-left outline-none transition-colors hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${isSelected ? 'bg-primary/10' : ''}`}
                              >
                                <span className={`inline-flex rounded border px-1.5 py-0.5 text-xs font-medium ${resultBadgeClass(first.state)}`}>
                                  {resultStateLabel(first.state)}
                                </span>
                                <span className="line-clamp-2 max-w-[14rem] break-words leading-relaxed text-foreground">
                                  {first.value}
                                </span>
                                <span className="flex w-full items-center justify-between gap-2 text-xs text-muted-foreground">
                                  <span>{results.length > 1
                                    ? (strings.multipleResults ?? '{count} 筆').replace('{count}', String(results.length))
                                    : primaryResultName(first, nameMode)}
                                  </span>
                                  <ChevronDown
                                    className={`h-3.5 w-3.5 shrink-0 transition-transform ${isSelected ? 'rotate-180' : ''}`}
                                    aria-hidden="true"
                                  />
                                </span>
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedResults.length > 0 && selected && (
                <div className="border-t bg-card px-3 py-3" aria-live="polite">
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <h4 className="text-sm font-semibold text-foreground">
                      {formatDate(selected.date)} · {stageLabel(selected.stage)}
                    </h4>
                    <button
                      type="button"
                      onClick={() => setSelectedCell(null)}
                      className="min-h-8 rounded px-2 text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {strings.collapse ?? '收合'}
                    </button>
                  </div>
                  <div className="divide-y divide-border">
                    {selectedResults.map((result) => {
                      const secondaryName = secondaryResultName(result, nameMode)
                      return (
                        <article key={result.id} className="py-3 first:pt-0 last:pb-0">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-foreground">
                                {primaryResultName(result, nameMode)}
                              </div>
                              {secondaryName && (
                                <div className="mt-0.5 text-xs text-muted-foreground">
                                  {(strings.sourceName ?? '來源名稱：{name}').replace('{name}', secondaryName)}
                                </div>
                              )}
                            </div>
                            <span className={`inline-flex shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium ${resultBadgeClass(result.state)}`}>
                              {resultStateLabel(result.state)}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {result.organization && <span>{result.organization}</span>}
                            {result.sourceOrderCode && <span>{result.sourceOrderCode}</span>}
                            {result.sourceRoleConflict && (
                              <span className="font-medium text-amber-700 dark:text-amber-300">
                                {strings.roleConflict ?? '來源代碼與名稱不一致'}
                              </span>
                            )}
                          </div>
                          <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                            {result.value}
                          </div>
                          {result.susceptibilities.length > 0 && (
                            <div className="mt-3 max-w-md overflow-hidden rounded-md border">
                              <table className="w-full text-xs">
                                <thead className="bg-muted/70">
                                  <tr>
                                    <th className="px-2 py-1.5 text-left font-semibold">
                                      {strings.antibiotic ?? '抗生素'}
                                    </th>
                                    <th className="px-2 py-1.5 text-left font-semibold">
                                      {strings.susceptibility ?? '藥敏'}
                                    </th>
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
                        </article>
                      )
                    })}
                  </div>
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
