"use client"

import { memo, useId, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useLanguage } from '@/src/application/providers/language.provider'
import { HighlightText } from '@/src/shared/components/HighlightText'
import { cn } from '@/src/shared/utils/cn.utils'
import type { Observation, Row } from '../types'
import { formatDate, getCodeableConceptText, getValueWithUnit } from '../utils/fhir-helpers'
import { isCancerScreeningRecommendationTitle } from '../utils/cancer-screening-grouping'
import { ReportInstitutionLabel } from './ReportInstitutionLabel'
import { ReportTypeBadge } from './ReportTypeBadge'

interface CancerScreeningRowProps {
  row: Row
  defaultOpen?: readonly string[]
  query?: string
  showTypeBadge?: boolean
}

function compactText(value?: string): string {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

function getObservationDisplayValue(observation: Observation): string {
  if (observation.valueQuantity) return getValueWithUnit(observation.valueQuantity)
  if (observation.valueString) return compactText(observation.valueString)
  return compactText(getCodeableConceptText(observation.valueCodeableConcept))
}

function getScreeningValues(observations: Observation[]): string[] {
  const values = observations
    .map(getObservationDisplayValue)
    .filter(Boolean)

  return Array.from(new Set(values))
}

function rowDateValue(row: Row): number {
  const raw = row.effectiveDate || row.obs[0]?.effectiveDateTime
  if (!raw) return 0
  const value = new Date(raw).getTime()
  return Number.isNaN(value) ? 0 : value
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function removeRepeatedResultPrefix(text: string, latestValues: string[]): string {
  for (const value of latestValues) {
    const pattern = new RegExp(`^${escapeRegExp(value)}\\s*[：:]\\s*`, 'i')
    if (pattern.test(text)) return text.replace(pattern, '')
  }
  return text
}

function CancerScreeningRowImpl({ row, defaultOpen = [], query, showTypeBadge }: CancerScreeningRowProps) {
  const { t } = useLanguage()
  const labels = t.reports.cancerScreeningRow
  const contentId = useId()
  const members = useMemo(
    () => row.groupedRows?.length ? row.groupedRows : [row],
    [row],
  )
  const resultRows = useMemo(() => members
    .filter((member) => !isCancerScreeningRecommendationTitle(member.title))
    .sort((a, b) => rowDateValue(b) - rowDateValue(a)), [members])
  const recommendationRows = useMemo(() => members.filter((member) => (
    isCancerScreeningRecommendationTitle(member.title)
  )), [members])
  const latestResult = resultRows[0]
  const latestValues = useMemo(
    () => latestResult ? getScreeningValues(latestResult.obs) : [],
    [latestResult],
  )
  const latestDisplayValue = latestValues.join('、') || labels.noResult
  const latestDate = formatDate(latestResult?.effectiveDate)
  const recommendations = useMemo(() => Array.from(new Set(
    recommendationRows.flatMap((member) => getScreeningValues(member.obs))
      .map((value) => removeRepeatedResultPrefix(value, latestValues))
      .filter(Boolean),
  )), [recommendationRows, latestValues])
  const expandable = resultRows.length > 1 || recommendations.length > 0
  const autoOpen = expandable && (
    !!query?.trim()
    || defaultOpen.includes(row.id)
    || members.some((member) => defaultOpen.includes(member.id))
  )
  const [manualOpen, setManualOpen] = useState(false)
  const open = expandable && (autoOpen || manualOpen)
  const countLabel = labels.resultCount.replace('{n}', String(resultRows.length))

  const header = (
    <>
      {expandable && (
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      )}
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 @min-[36rem]:grid-cols-[minmax(10rem,0.8fr)_minmax(8rem,0.55fr)_minmax(0,1.1fr)_auto] @min-[36rem]:items-center">
        <span className="flex min-w-0 items-center gap-1.5">
          {showTypeBadge && <ReportTypeBadge group="cancer-screening" />}
          <span className="min-w-0 truncate font-semibold text-foreground" title={row.title}>
            <HighlightText text={row.title} query={query} />
          </span>
        </span>

        <div className="col-start-1 row-start-2 flex min-w-0 items-baseline gap-1.5 @min-[36rem]:col-start-2 @min-[36rem]:row-start-1">
          <span className="shrink-0 text-xs text-muted-foreground">{labels.latest}</span>
          <span className="truncate font-semibold text-foreground" title={latestDisplayValue}>
            <HighlightText text={latestDisplayValue} query={query} />
          </span>
        </div>

        {(latestResult?.institution || latestDate) && (
          <div className="col-span-2 row-start-3 flex min-w-0 items-center gap-2 text-xs text-muted-foreground @min-[36rem]:col-span-1 @min-[36rem]:col-start-3 @min-[36rem]:row-start-1">
            {latestResult?.institution && (
              <ReportInstitutionLabel
                institution={latestResult.institution}
                className="min-w-0 max-w-[10rem] flex-1 @min-[36rem]:max-w-[12rem]"
              />
            )}
            {latestDate && (
              <time className="shrink-0 tabular-nums" dateTime={latestResult?.effectiveDate}>
                {latestDate}
              </time>
            )}
          </div>
        )}

        <span className="col-start-2 row-start-1 shrink-0 justify-self-end text-xs text-muted-foreground @min-[36rem]:col-start-4">
          {countLabel}
        </span>
      </div>
    </>
  )

  return (
    <div className="pb-1" data-cancer-screening-kind="group">
      <div className="overflow-hidden rounded-md border border-border/90 bg-muted/40">
        {expandable ? (
          <button
            type="button"
            onClick={() => setManualOpen((current) => !current)}
            aria-expanded={open}
            aria-controls={contentId}
            aria-label={(open ? labels.collapse : labels.expand).replace('{name}', row.title)}
            className="flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          >
            {header}
          </button>
        ) : (
          <div className="flex min-h-11 w-full items-center gap-2 px-3 py-1.5">
            {header}
          </div>
        )}

        {open && (
          <div id={contentId} className="border-t border-border/70 bg-background/35">
            {resultRows.length > 0 && (
              <section aria-label={labels.history}>
                <div className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                  {labels.history}
                </div>
                <div className="divide-y divide-border/60">
                  {resultRows.map((resultRow) => {
                    const resultValue = getScreeningValues(resultRow.obs).join('、') || labels.noResult
                    const resultDate = formatDate(resultRow.effectiveDate)
                    return (
                      <div
                        key={resultRow.id}
                        className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
                      >
                        <time className="shrink-0 tabular-nums text-muted-foreground" dateTime={resultRow.effectiveDate}>
                          {resultDate || '—'}
                        </time>
                        {resultRow.institution && (
                          <ReportInstitutionLabel
                            institution={resultRow.institution}
                            className="max-w-[12rem] min-w-0 flex-1"
                          />
                        )}
                        <span className="ml-auto shrink-0 font-semibold text-foreground">
                          <HighlightText text={resultValue} query={query} />
                        </span>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {recommendations.length > 0 && (
              <section className="border-t border-border/70 px-3 py-2" aria-label={labels.recommendation}>
                <div className="mb-1 text-xs font-medium text-muted-foreground">
                  {labels.recommendation}
                </div>
                <div className="space-y-1.5 text-sm leading-relaxed text-foreground">
                  {recommendations.map((recommendation) => (
                    <p key={recommendation}>
                      <HighlightText text={recommendation} query={query} />
                    </p>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export const CancerScreeningRow = memo(CancerScreeningRowImpl)
