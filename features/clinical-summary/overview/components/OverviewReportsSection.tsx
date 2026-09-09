"use client"

// 影像／檢查報告 — the narrative half of the 報告 tab.
//
// Rows come from the same `buildReportsData` projection the 報告 tab renders,
// so the title, the type badge and the institution label are identical; only
// the density differs (one line in the 2×2 layout, two lines when stacked).
import { useMemo, useState, type Ref } from 'react'
import { ChevronDown, ScanLine } from 'lucide-react'
import { useLanguage } from '@/src/application/providers/language.provider'
import { formatDate } from '@/src/shared/utils/date.utils'
import { cn } from '@/src/shared/utils/cn.utils'
import { ReportTypeBadge } from '@/features/clinical-summary/reports/components/ReportTypeBadge'
import { ReportInstitutionLabel } from '@/features/clinical-summary/reports/components/ReportInstitutionLabel'
import type { ReportGroup } from '@/features/clinical-summary/reports/types'
import type { OverviewReportsData } from '../hooks/useOverviewData'
import type { OverviewSectionFit } from '../overview.types'
import { OVERVIEW_SECTION_DOM_ID } from '../overview.types'
import { fitRows } from '../utils/overview-selectors'
import { OverviewSectionCard } from './OverviewSectionCard'
import {
  OverviewEmptyRow,
  OverviewOpenTabButton,
  OverviewTruncationNote,
  useOverviewNavigate,
} from './OverviewSectionParts'
import { OVERVIEW_LIST_ROW_CLASS, overviewChipClass } from './overview-styles'

/** Single-line row: 26px of content, the row's 2px border, the 4px stack gap. */
const OVERVIEW_REPORT_ROW_PX = 32
/** One expanded row keeps its narrative clamped to this height. */
const OVERVIEW_REPORT_EXPANDED_PX = 96

// ReportGroup ids and the reports card's sub-tab values are the same strings,
// except 'other', which has no tab of its own and falls back to the card's
// existing "first tab that contains the row" behaviour.
function reportTabForGroup(group: ReportGroup | undefined): string | undefined {
  return group && group !== 'other' ? group : undefined
}

function matchedGroupOf(items: { group: ReportGroup }[]): string | undefined {
  return reportTabForGroup(items[0]?.group)
}

export function OverviewReportsSection({
  data,
  fit,
  flash = false,
  headingRef,
}: {
  data: OverviewReportsData
  fit: OverviewSectionFit
  flash?: boolean
  headingRef?: Ref<HTMLDivElement>
}) {
  const { t, locale } = useLanguage()
  const strings = t.overview
  const navigateTo = useOverviewNavigate()
  const [group, setGroup] = useState<ReportGroup | 'all'>('all')
  // The 2×2 card has room for exactly one open narrative, so expansion is
  // single-select there; the stacked layout keeps the same rule for symmetry.
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const badgeLabels = t.reports.typeBadges as Record<string, string>
  const effectiveGroup = group !== 'all' && !data.groups.includes(group) ? 'all' : group
  const matched = useMemo(
    () => (effectiveGroup === 'all'
      ? data.items
      : data.items.filter((item) => item.group === effectiveGroup)),
    [data.items, effectiveGroup],
  )

  // 「全部」 is a flat per-report index, so landing there after reading a
  // truncated imaging list means searching for the same rows again. Send the
  // reader to the sub-tab they were already filtered to — or, with no filter,
  // the one the first listed report belongs to. 'other' has no sub-tab of its
  // own; that request is simply omitted and the card keeps its own behaviour.
  const preferredReportTab = effectiveGroup !== 'all'
    ? reportTabForGroup(effectiveGroup)
    : matchedGroupOf(matched)
  const target = {
    resourceType: 'DiagnosticReport',
    resourceId: matched[0]?.navResourceId ?? data.items[0]?.navResourceId,
    tabLabel: t.tabs.reports,
    reportTab: preferredReportTab,
  }

  const shown = useMemo(() => {
    if (!fit.bounded || fit.availablePx === undefined) return matched
    const expandedCost = matched.some((item) => item.id === expandedId)
      ? OVERVIEW_REPORT_EXPANDED_PX
      : 0
    return matched.slice(
      0,
      fitRows(fit.availablePx, OVERVIEW_REPORT_ROW_PX, expandedCost, matched.length),
    )
  }, [expandedId, fit.availablePx, fit.bounded, matched])

  const hidden = matched.length - shown.length
  // The open narrative is charged to the budget, which can push the row that
  // owns it past the cut. Render the expansion only while its row survives, so
  // the card can never overflow to show text nobody can reach.
  const expandedVisible = shown.some((item) => item.id === expandedId)
  const groupLabel = (value: ReportGroup): string =>
    badgeLabels[value === 'cancer-screening' ? 'cancerScreening' : value] ?? value

  return (
    <OverviewSectionCard
      id={OVERVIEW_SECTION_DOM_ID.reports}
      icon={ScanLine}
      title={strings.sections.reports}
      count={strings.counts.reports.replace('{count}', String(data.count))}
      bounded={fit.bounded}
      flash={flash}
      headingRef={headingRef}
      actions={(
        <>
          <button
            type="button"
            aria-pressed={effectiveGroup === 'all'}
            className={overviewChipClass(effectiveGroup === 'all')}
            onClick={() => setGroup('all')}
          >
            {strings.reports.all}
          </button>
          {data.groups.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={effectiveGroup === value}
              className={overviewChipClass(effectiveGroup === value)}
              onClick={() => setGroup(value)}
            >
              {groupLabel(value)}
            </button>
          ))}
          <OverviewOpenTabButton target={target} />
        </>
      )}
    >
      {shown.length === 0 ? (
        <OverviewEmptyRow />
      ) : (
        <>
          <div className={cn('flex min-w-0 shrink-0 flex-col', fit.bounded ? 'gap-1' : 'gap-1.5')}>
            {shown.map((item) => {
              const expanded = expandedVisible && expandedId === item.id
              const hasText = !!item.fullText
              return (
                <div
                  key={item.id}
                  className={cn(OVERVIEW_LIST_ROW_CLASS, hasText && 'cursor-pointer')}
                  role={hasText ? 'button' : undefined}
                  tabIndex={hasText ? 0 : undefined}
                  aria-expanded={hasText ? expanded : undefined}
                  aria-label={hasText
                    ? (expanded ? strings.reports.collapse : strings.reports.expand)
                    : undefined}
                  onClick={() => hasText && setExpandedId(expanded ? null : item.id)}
                  onKeyDown={(event) => {
                    if (!hasText) return
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    setExpandedId(expanded ? null : item.id)
                  }}
                >
                  <div className={cn('min-w-0 px-2', fit.bounded ? 'py-0' : 'py-1')}>
                    <div className={cn(
                      'flex min-w-0 items-center gap-1.5',
                      fit.bounded && 'h-[26px]',
                    )}>
                      <span className="shrink-0 whitespace-nowrap text-xs font-medium tabular-nums text-foreground">
                        {item.day ? formatDate(item.day, locale) : '—'}
                      </span>
                      <ReportTypeBadge group={item.group} className="h-5" />
                      <span
                        className={cn(
                          // The exam name outranks the institution and the
                          // one-line conclusion for space on a crowded row.
                          'truncate text-xs font-semibold text-foreground',
                          fit.bounded ? 'max-w-[40%] shrink-0' : 'shrink',
                        )}
                        title={item.title}
                      >
                        {item.title}
                      </span>
                      {item.institution && (
                        <ReportInstitutionLabel
                          institution={item.institution}
                          locale={locale}
                          // The whole row is the expand target here, so the
                          // institution tooltip must not swallow the tap the
                          // way it does in the 報告 tab's own rows.
                          stopPropagation={false}
                          className="max-w-[8rem] shrink text-[0.6875rem]"
                        />
                      )}
                      {fit.bounded && item.summary && (
                        <span className="min-w-0 flex-1 truncate text-[0.6875rem] text-foreground/75">
                          {item.summary}
                        </span>
                      )}
                      {hasText && (
                        <ChevronDown
                          aria-hidden="true"
                          className={cn(
                            'ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                            expanded && 'rotate-180',
                          )}
                        />
                      )}
                    </div>
                    {!fit.bounded && item.summary && (
                      <div className="min-w-0 truncate text-xs text-foreground/75">
                        {item.summary}
                      </div>
                    )}
                    {expanded && hasText && (
                      <div className="mt-1 border-t border-border/60 pt-1.5">
                        <div
                          className={cn(
                            'whitespace-pre-line text-foreground',
                            fit.bounded
                              ? 'overflow-hidden text-[0.6875rem] leading-[1.5]'
                              : 'text-xs leading-relaxed',
                          )}
                          style={fit.bounded
                            ? { maxHeight: `${OVERVIEW_REPORT_EXPANDED_PX}px` }
                            : undefined}
                        >
                          {item.fullText}
                        </div>
                        {fit.bounded && (
                          <button
                            type="button"
                            className="cursor-pointer pt-0.5 text-[0.6875rem] text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                            onClick={(event) => {
                              event.stopPropagation()
                              navigateTo({
                                resourceType: item.navResourceType,
                                resourceId: item.navResourceId,
                                tabLabel: t.tabs.reports,
                                reportTab: reportTabForGroup(item.group),
                              })
                            }}
                          >
                            {strings.reports.fullTextLink}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {fit.bounded && <OverviewTruncationNote hiddenCount={hidden} target={target} />}
        </>
      )}
    </OverviewSectionCard>
  )
}
