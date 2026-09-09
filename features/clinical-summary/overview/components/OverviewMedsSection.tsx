"use client"

// 用藥 — the therapies running (or just stopped) inside the window, with the
// change verdict computed by `classifyMedicationChanges` against the FULL
// prescription history so "new" really means new.
import { useMemo, useState, type Ref } from 'react'
import { Pill } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useLanguage } from '@/src/application/providers/language.provider'
import { formatDate } from '@/src/shared/utils/date.utils'
import { cn } from '@/src/shared/utils/cn.utils'
import {
  getMedicationDaysLeftBadgeClass,
  medicationCategoryChipClass,
  medicationChronicBadgeClass,
} from '@/features/clinical-summary/medications/components/medication-chip-styles'
import { CLINICAL_CATEGORY_TONE } from '@/features/clinical-summary/components/clinical-color-roles'
import { ReportInstitutionLabel } from '@/features/clinical-summary/reports/components/ReportInstitutionLabel'
import type { OverviewMedItem, OverviewMedsData } from '../hooks/useOverviewData'
import type { OverviewSectionFit } from '../overview.types'
import { OVERVIEW_SECTION_DOM_ID } from '../overview.types'
import { fitRows } from '../utils/overview-selectors'
import { OverviewSectionCard } from './OverviewSectionCard'
import {
  OverviewEmptyRow,
  OverviewOpenTabButton,
  OverviewTruncationNote,
} from './OverviewSectionParts'
import {
  OVERVIEW_CHANGE_PILL_CLASS,
  OVERVIEW_LIST_ROW_CLASS,
  overviewChipClass,
} from './overview-styles'

type MedFilter = 'all' | 'changed' | 'chronic'

/** Single-line row: 24px of content, the row's 2px border, the 3px stack gap. */
const OVERVIEW_MED_ROW_PX = 29

function ChangeBadge({ item, compact }: { item: OverviewMedItem; compact: boolean }) {
  const { t } = useLanguage()
  const strings = t.overview.meds
  if (!item.change) return null
  const size = compact ? 'h-[18px] text-[0.625rem]' : 'h-5 text-[0.6875rem]'
  if (item.change.kind === 'added') {
    return (
      <Badge variant="outline" className={cn('shrink-0 border-transparent px-1.5 py-0', size, CLINICAL_CATEGORY_TONE)}>
        {strings.added}
      </Badge>
    )
  }
  if (item.change.kind === 'stopped') {
    return (
      <Badge variant="outline" className={cn('shrink-0 border-transparent bg-muted/60 px-1.5 py-0 text-muted-foreground', size)}>
        {strings.stopped}
      </Badge>
    )
  }
  return (
    <span className={cn(OVERVIEW_CHANGE_PILL_CLASS, 'rounded-md px-1.5', size)}>
      {strings.adjusted}
    </span>
  )
}

export function OverviewMedsSection({
  data,
  fit,
  flash = false,
  headingRef,
}: {
  data: OverviewMedsData
  fit: OverviewSectionFit
  flash?: boolean
  headingRef?: Ref<HTMLDivElement>
}) {
  const { t, locale } = useLanguage()
  const strings = t.overview
  const [filter, setFilter] = useState<MedFilter>('all')
  const target = {
    resourceType: 'MedicationRequest',
    resourceId: data.items[0]?.id,
    tabLabel: t.tabs.medications,
  }

  const matched = useMemo(() => data.items.filter((item) => {
    if (filter === 'changed') return !!item.change
    if (filter === 'chronic') return item.isChronic
    return true
  }), [data.items, filter])

  const shown = useMemo(() => {
    if (!fit.bounded || fit.availablePx === undefined) return matched
    return matched.slice(0, fitRows(fit.availablePx, OVERVIEW_MED_ROW_PX, 0, matched.length))
  }, [fit.availablePx, fit.bounded, matched])

  const hidden = matched.length - shown.length
  const compact = fit.bounded

  const chips: { id: MedFilter; label: string; enabled: boolean }[] = [
    { id: 'all', label: strings.meds.all, enabled: true },
    { id: 'changed', label: strings.meds.changed, enabled: data.changeCount > 0 },
    { id: 'chronic', label: strings.meds.chronic, enabled: data.chronicCount > 0 },
  ]

  return (
    <OverviewSectionCard
      id={OVERVIEW_SECTION_DOM_ID.meds}
      icon={Pill}
      title={strings.sections.meds}
      count={strings.counts.meds.replace('{count}', String(data.count))}
      bounded={fit.bounded}
      flash={flash}
      headingRef={headingRef}
      actions={(
        <>
          {chips.filter((chip) => chip.enabled).map((chip) => (
            <button
              key={chip.id}
              type="button"
              aria-pressed={filter === chip.id}
              className={overviewChipClass(filter === chip.id)}
              onClick={() => setFilter(chip.id)}
            >
              {chip.label}
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
          <div className={cn('flex min-w-0 shrink-0 flex-col', compact ? 'gap-[3px]' : 'gap-1.5')}>
            {shown.map((item) => {
              const dose = item.change?.kind === 'adjusted' && item.change.previousDose
                ? `${item.change.previousDose} → ${item.doseText}`
                : item.doseText
              const daysLeft = item.daysRemaining
              const chronicBadge = item.isChronic && (
                <Badge
                  variant="outline"
                  className={cn(
                    'shrink-0 px-1.5 py-0',
                    compact ? 'h-[18px] text-[0.625rem]' : 'h-5 text-[0.6875rem]',
                    medicationChronicBadgeClass,
                  )}
                >
                  {strings.meds.chronicBadge}
                </Badge>
              )
              const daysBadge = daysLeft !== undefined && (
                <Badge
                  variant="outline"
                  className={cn(
                    'shrink-0 px-1.5 py-0',
                    compact ? 'h-[18px] text-[0.625rem]' : 'h-5 text-[0.6875rem]',
                    getMedicationDaysLeftBadgeClass(daysLeft),
                    // The medication list sizes this badge for a grid column
                    // (`w-full`); in a single flex line it has to hug its text.
                    'w-auto max-w-none shrink-0',
                  )}
                >
                  {daysLeft < 0
                    ? strings.meds.daysUsedUp
                    : strings.meds.daysLeft.replace('{days}', String(daysLeft))}
                </Badge>
              )
              // Space priority on a crowded single line: the trailing status
              // badges must never be clipped, the drug name gives up width
              // last, and the institution absorbs the squeeze first (it
              // shrinks several times faster). The pharmacological category is
              // deliberately absent from the one-line row — at this width it
              // truncated to 「Psycholepti…」, which identifies nothing, while
              // eating the space the frequency and the issuing institution
              // need. The full category stays on the 用藥 tab.
              const nameClass = cn(
                'truncate font-semibold',
                compact ? 'min-w-0 max-w-[38%] shrink text-xs' : 'shrink text-[0.8125rem]',
                item.isInactive ? 'text-muted-foreground line-through' : 'text-foreground',
              )

              if (compact) {
                return (
                  <div key={item.id} className={cn(OVERVIEW_LIST_ROW_CLASS, 'flex h-6 items-center gap-1 px-2')}>
                    <ChangeBadge item={item} compact />
                    <span className={nameClass} title={item.title}>{item.title}</span>
                    {dose && (
                      <span className="shrink-0 whitespace-nowrap text-[0.6875rem] text-muted-foreground">
                        {dose}
                      </span>
                    )}
                    {item.institution && (
                      <ReportInstitutionLabel
                        institution={item.institution}
                        locale={locale}
                        className="min-w-0 flex-1 shrink-[4] text-[0.6875rem]"
                      />
                    )}
                    {item.day && (
                      <span className="shrink-0 whitespace-nowrap text-[0.6875rem] tabular-nums text-muted-foreground">
                        {formatDate(item.day, locale)}
                      </span>
                    )}
                    {chronicBadge}
                    {daysBadge}
                  </div>
                )
              }

              return (
                <div key={item.id} className={cn(OVERVIEW_LIST_ROW_CLASS, 'px-3 py-1')}>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <ChangeBadge item={item} compact={false} />
                    <span className={nameClass} title={item.title}>{item.title}</span>
                    {dose && (
                      <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                        {dose}
                      </span>
                    )}
                    <span className="ml-auto flex shrink-0 items-center gap-1.5">
                      {chronicBadge}
                      {daysBadge}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {item.category && (
                      <span className={cn(medicationCategoryChipClass, 'text-[0.6875rem]')}>
                        {item.category}
                      </span>
                    )}
                    {item.institution && (
                      <ReportInstitutionLabel
                        institution={item.institution}
                        locale={locale}
                        className="max-w-[12rem] text-[0.6875rem]"
                      />
                    )}
                    {item.day && (
                      <span className="whitespace-nowrap text-[0.6875rem] tabular-nums text-muted-foreground">
                        {formatDate(item.day, locale)}
                      </span>
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
