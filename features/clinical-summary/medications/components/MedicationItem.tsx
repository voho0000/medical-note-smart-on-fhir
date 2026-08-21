// Medication Item Component — a dense, container-responsive three-lane row.
// Wide: identity/schedule | category/ICD | supply/refills (two lines total).
// Narrow: identity + supply stay first; clinical metadata moves below instead
// of being clipped, so the same row remains usable inside the right pane.
//
// Container-query thresholds are in **px**, not rem: the app's root font-size
// is 12px, so a rem threshold silently shifts with the reader's font-size
// setting. The values are the ones the three-lane layout has always used in
// practice (312/336/384/456), now stated literally.
//
// The identity lane is ~151px on a 375pt phone, and a full
// "start → end (N 天) · institution" needs ~205px — that overflow is what used
// to make the date overprint the pharmacy. Rather than spend a third line on
// it (which costs roughly a third of the medications visible per screen), the
// end date folds away below DATE_RANGE_END_MIN_WIDTH; see there for why that
// is safe.
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { CLINICAL_SOURCE_TONE } from "@/features/clinical-summary/components/clinical-color-roles"
import { clinicalTooltipSurfaceClass } from "@/features/clinical-summary/components/clinical-metadata-styles"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAudience } from "@/src/application/providers/audience.provider"
import { useResourceAnchor } from "@/src/application/hooks/use-resource-anchor.hook"
import { cn } from "@/src/shared/utils/cn.utils"
import { formatDate as formatCalendarDate } from "@/src/shared/utils/date.utils"
import type { MedicationExecutionPeriod, MedicationNameMode, MedicationRow } from '../types'
import {
  medicationCategoryChipClass,
  medicationChronicBadgeClass,
  medicationIcdChipClass,
  medicationIcdCodeClass,
  medicationIcdDescriptionClass,
  getMedicationDaysLeftBadgeClass,
  getMedicationStatusBadgeClass,
} from './medication-chip-styles'
import { MedicationTerminologyTooltip } from './MedicationTerminologyTooltip'

interface MedicationItemProps {
  medication: MedicationRow
  /** Renders a "目前服用" chip on rows whose sourceResourceType is
   *  MedicationStatement. Driven from MedListCard's mixed-source detection
   *  — for the bridge default (all MedicationRequest) it stays off. */
  showSourceChip?: boolean
  sourceChipStatementLabel?: string
  sourceChipStatementTooltip?: string
  /** Exact source-reported inpatient execution windows. When provided, these
   *  replace the generic prescription/supply date text without changing the
   *  shared medication title, terminology, badges, or metadata layout. */
  executionPeriods?: MedicationExecutionPeriod[]
  /** Controls which single drug name is rendered. Both names remain available
   *  in the terminology tooltip so the compact row never has to show both. */
  nameMode?: MedicationNameMode
  /** Removes the individual card boundary when rows live in a shared list
   *  frame. The internal three-lane information grid stays identical. */
  grouped?: boolean
}

function getStatusBadge(medication: MedicationRow, mt: any) {
  if (medication.isInactive) {
    return { label: medication.status === 'active' ? (mt.statusEnded ?? 'ended') : medication.status, variant: 'secondary' as const }
  }
  if (medication.daysRemaining !== undefined) {
    if (medication.daysRemaining <= 0) {
      return { label: mt.statusEndingToday ?? 'ending today', variant: 'outline' as const }
    }
    return { label: (mt.daysLeft ?? '{n}d left').replace('{n}', String(medication.daysRemaining)), variant: 'default' as const }
  }
  return { label: medication.status, variant: 'default' as const }
}

// Compact date: "5/13/2026" → "5/13/26". Keeps year visible (matters
// clinically — last refill 2 years ago vs 2 months ago) but strips two
// digits and the trailing label noise.
function shortDate(s?: string): string {
  if (!s) return ''
  return s.replace(/(\d{1,2})\/(\d{1,2})\/(\d{2})(\d{2})/, '$1/$2/$4')
}

function sourceCalendarDate(value: string, locale: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return formatCalendarDate(value, locale)
  const [, year, month, day] = match
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Number(year), Number(month) - 1, Number(day)))
}

/** Container width at which the identity lane can hold a full date RANGE
 *  alongside the institution. Below it the end date folds away — see the
 *  schedule builder for the conditions that make that lossless. */
const DATE_RANGE_END_CLASS = 'hidden @min-[416px]:inline'

function Sep() {
  return <span className="text-muted-foreground/40 select-none" aria-hidden>·</span>
}

export function MedicationItem({
  medication,
  showSourceChip = false,
  sourceChipStatementLabel,
  sourceChipStatementTooltip,
  executionPeriods,
  nameMode = 'ingredient',
  grouped = false,
}: MedicationItemProps) {
  const { t, locale } = useLanguage()
  const { audience } = useAudience()
  const mt = (t.medications as any)
  const badge = getStatusBadge(medication, mt)
  const chronicLabel = mt.chronic ?? '慢箋'
  const isMedical = audience === 'medical'
  const showStatementChip =
    showSourceChip && medication.sourceResourceType === 'MedicationStatement'
  const billingIcdTitle = medication.icdCode
    ? `${medication.icdCode}${medication.icdText ? ` ${medication.icdText}` : ''}`
    : mt.billingIcdTooltip
  const terminology = medication.drugTerminology
  const fullMedicationTitle = [
    medication.title,
    medication.secondaryTitle,
    terminology?.atcCode ? `ATC ${terminology.atcCode}` : undefined,
  ].filter(Boolean).join(' · ')
  const displayMedicationTitle =
    nameMode === 'product' && medication.secondaryTitle
      ? medication.secondaryTitle
      : medication.title
  const hasDaysRemaining = medication.daysRemaining !== undefined
  const isActivePastSupplyEnd =
    medication.isInactive &&
    medication.status === 'active' &&
    hasDaysRemaining &&
    medication.daysRemaining! < 0
  const showDaysLeftIndicator =
    hasDaysRemaining && (!medication.isInactive || isActivePastSupplyEnd)

  // The left metadata lane is deliberately ordered by clinical scanning
  // priority: coverage dates, source institution, then dose/route/frequency.
  // All optional values collapse without moving the ICD or supply columns.
  const scheduleParts: React.ReactNode[] = []

  const normalizedExecutionPeriods = (executionPeriods ?? [])
    .filter((period) => period.start || period.end)
    .filter((period, index, all) => {
      const key = `${period.start || ''}|${period.end || ''}`
      return all.findIndex(
        (candidate) => `${candidate.start || ''}|${candidate.end || ''}` === key,
      ) === index
    })

  if (normalizedExecutionPeriods.length > 0) {
    const periodLabels = normalizedExecutionPeriods.map((period) => {
      const start = period.start
        ? sourceCalendarDate(period.start, locale)
        : ''
      const end = period.end
        ? sourceCalendarDate(period.end, locale)
        : start
      if (!start) return end
      if (!end || start === end) return start
      return `${start}–${end}`
    }).filter(Boolean)
    const executionLabel = `${mt.executionPeriod ?? '執行'} ${periodLabels.join('、')}`
    scheduleParts.push(
      <span key="execution-period" className="truncate" title={executionLabel}>
        {executionLabel}
      </span>,
    )
  } else {
    // Generic medication list: prefer "start → end" for active and
    // "ended end" for inactive. Inpatient execution dates use the branch
    // above because their source semantics are different from supply coverage.
    const startShort = shortDate(medication.startedOn)
    const endShort = shortDate(medication.endDate)
    if (startShort || endShort) {
      const durationTemplate = mt.durationCompact
        ?? (locale.startsWith('zh') ? '{n} 天' : '{n}d')
      const durationLabel = medication.durationDays && !medication.isInactive
        ? durationTemplate.replace('{n}', String(medication.durationDays))
        : ''

      let leadLabel: string
      let rangeEnd = ''
      if (medication.isInactive && endShort) {
        leadLabel = `${mt.endedPrefix ?? 'ended'} ${endShort}`
      } else if (startShort && endShort) {
        leadLabel = startShort
        rangeEnd = ` → ${endShort}`
      } else {
        leadLabel = startShort || endShort
      }
      const durationSuffix = durationLabel ? ` (${durationLabel})` : ''
      const dateLabel = `${leadLabel}${rangeEnd}${durationSuffix}`

      // Folding the end date is only lossless when the duration is there to
      // rebuild it: start + N 天 gives the same window, and the 「剩 N 天」 badge
      // beside it already carries the part a clinician acts on. Without a
      // duration the end date IS the coverage information, so it stays put and
      // the row truncates instead. Inactive rows lead with the end date and
      // never reach this branch.
      const foldsEndDate = Boolean(rangeEnd && durationLabel)

      scheduleParts.push(
        <span key="date" data-testid="medication-schedule-date" className="min-w-0 truncate" title={dateLabel}>
          {leadLabel}
          {rangeEnd ? (
            <span className={foldsEndDate ? DATE_RANGE_END_CLASS : undefined}>{rangeEnd}</span>
          ) : null}
          {durationSuffix}
        </span>,
      )
    }
  }

  if (medication.pharmacy) {
    scheduleParts.push(
      <span
        key="pharm"
        title={medication.pharmacy}
        className={cn(
          "inline-flex h-5 min-w-0 max-w-[8.5rem] shrink items-center text-[0.6875rem]",
          CLINICAL_SOURCE_TONE,
        )}
      >
        <span className="truncate">{medication.pharmacy}</span>
      </span>
    )
  }
  if (medication.dose) scheduleParts.push(<span key="dose">{medication.dose}</span>)
  if (medication.route) scheduleParts.push(<span key="route">{medication.route}</span>)
  if (medication.frequency) scheduleParts.push(<span key="freq">{medication.frequency}</span>)
  const firstRefillDate = shortDate(medication.firstRefillDate)
  const refillSummary = medication.refillCount > 1
    ? (firstRefillDate
        ? (mt.refillSummarySince
          ?? (locale.startsWith('zh')
            ? '累計 {count} 次 · {date} 起'
            : '{count} refills · since {date}'))
        : (mt.refillSummary
          ?? (locale.startsWith('zh') ? '累計 {count} 次' : '{count} refills')))
      .replace('{count}', String(medication.refillCount))
      .replace('{date}', firstRefillDate)
    : ''
  const refillCompact = medication.refillCount > 1
    ? (mt.refillSummary
      ?? (locale.startsWith('zh') ? '累計 {count} 次' : '{count} refills'))
      .replace('{count}', String(medication.refillCount))
    : ''

  // Resource-navigation anchor — catalog cites MedicationRequest OR
  // MedicationStatement, so this row answers to both.
  const anchorRef = useResourceAnchor(
    ['MedicationRequest', 'MedicationStatement'],
    medication.id,
  )

  return (
    <div
      ref={anchorRef}
      data-medication-row-layout="three-lane"
      className={cn(
        "grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)_4.75rem] gap-x-2 gap-y-0.5 overflow-hidden px-3 py-1 leading-tight transition-colors hover:bg-secondary/45 focus-within:bg-secondary/35 @min-[312px]:grid-cols-[minmax(0,1.25fr)_minmax(7.5rem,0.75fr)_4.75rem] @min-[336px]:grid-cols-[minmax(0,1.2fr)_minmax(8.5rem,0.8fr)_4.75rem] @min-[384px]:grid-cols-[minmax(0,1.15fr)_minmax(10.5rem,1fr)_4.75rem] @min-[456px]:grid-cols-[minmax(0,1.15fr)_minmax(14rem,1fr)_4.75rem] @min-[456px]:gap-x-3 dark:hover:bg-secondary/45 dark:focus-within:bg-secondary/35",
        grouped
          ? "rounded-none border-0 bg-transparent"
          : "rounded-md border border-border/70 bg-muted/40 dark:border-border/80 dark:bg-muted/30",
      )}
    >
      {/* Identity lane: medication on top, coverage/source underneath. */}
      <div data-medication-cell="identity" className="min-w-0 overflow-hidden">
        <div className="flex h-5 min-w-0 items-center">
          <MedicationTerminologyTooltip medication={medication} enabled>
            <span
              className={cn(
                "flex min-w-0 flex-1 items-baseline gap-1",
                terminology && "cursor-help",
              )}
              title={fullMedicationTitle}
              tabIndex={terminology ? 0 : undefined}
            >
              <span
                className="min-w-0 truncate text-[0.8125rem] font-semibold tracking-[-0.005em]"
              >
                {displayMedicationTitle}
              </span>
            </span>
          </MedicationTerminologyTooltip>
        </div>

        <div
          data-medication-schedule
          className="flex h-5 min-w-0 items-center gap-x-1 overflow-hidden whitespace-nowrap text-[0.6875rem] text-muted-foreground"
        >
          {scheduleParts.map((node, i) => (
            <span key={i} className="inline-flex min-w-0 items-center gap-x-1">
              {i > 0 && <Sep />}
              {node}
            </span>
          ))}
        </div>
      </div>

      {/* Clinical lane: stable tag rail above a quiet, borderless ICD line.
          On narrow containers it drops below the identity/status pair; once
          the panel reaches 26rem it becomes a compact middle column, then
          gains space progressively at 28rem, 32rem, and 38rem. */}
      <div
        data-medication-cell="clinical"
        className="col-span-2 row-start-2 grid h-5 min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-2 overflow-hidden @min-[312px]:col-span-1 @min-[312px]:col-start-2 @min-[312px]:row-start-1 @min-[312px]:h-10 @min-[312px]:grid-cols-1 @min-[312px]:grid-rows-2 @min-[312px]:gap-x-0"
      >
        <div className="col-start-2 row-start-1 flex h-5 min-w-0 items-center justify-end gap-1 overflow-hidden @min-[312px]:col-start-1 @min-[312px]:justify-start">
          {medication.category && (
            <span
              title={medication.category}
              className={medicationCategoryChipClass}
            >
              {medication.category}
            </span>
          )}
          {/* Keep one natural-width chronic-prescription slot on every row.
              Hiding (rather than removing) the badge prevents the category
              column from drifting horizontally between chronic and acute
              medications, while still adapting to the localized label. */}
          <span
            data-medication-chronic-slot
            data-visible={medication.isChronic ? 'true' : 'false'}
            aria-hidden={medication.isChronic ? undefined : true}
            title={medication.isChronic
              ? (mt.chronicTooltip ?? 'Continuous long term therapy')
              : undefined}
            className={cn(
              "inline-flex shrink-0 items-center rounded-full border px-1.5 py-0 text-[0.625rem] font-medium",
              medicationChronicBadgeClass,
              !medication.isChronic && "invisible",
            )}
          >
            {chronicLabel}
          </span>
          {/* 慢箋 early-refill merge indicator: an earlier same-drug fill from
              the SAME institution is still inside its window and was folded
              into this row (one continuing prescription). Cross-institution
              same-drug rows are never merged — that would mask a potential
              duplicate-therapy signal. */}
          {(medication.overlapCount ?? 0) > 0 && (
            <span
              title={mt.renewedTooltip ?? 'Previous fill from the same institution still in window; showing the latest fill of one continuing prescription.'}
              className="inline-flex shrink-0 items-center rounded-full border border-border bg-muted/50 px-1.5 py-0 text-[0.625rem] font-medium text-muted-foreground"
            >
              {mt.renewed ?? '已續領'}
            </span>
          )}
          {showStatementChip && (
            <span
              title={sourceChipStatementTooltip ?? 'MedicationStatement (currently taking, per source)'}
              className="inline-flex shrink-0 items-center rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0 text-[0.625rem] font-medium text-primary"
            >
              {sourceChipStatementLabel ?? '目前服用'}
            </span>
          )}
        </div>

        <div className="col-start-1 row-start-1 flex h-5 min-w-0 items-center overflow-hidden @min-[312px]:row-start-2">
          {isMedical && medication.icdCode && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  aria-label={billingIcdTitle}
                  tabIndex={0}
                  className={medicationIcdChipClass}
                >
                  <span className={medicationIcdCodeClass}>{medication.icdCode}</span>
                  {medication.icdText && (
                    <span className={medicationIcdDescriptionClass}>
                      {medication.icdText}
                    </span>
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent
                data-testid="medication-icd-tooltip"
                className={cn(
                  clinicalTooltipSurfaceClass,
                  "max-w-[min(90vw,28rem)] whitespace-normal break-words text-xs leading-relaxed",
                )}
              >
                {billingIcdTitle}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Supply lane: a fixed-width status/readout pair. Keeping both values
          in one column prevents short and long medicine names from shifting
          the clinically time-sensitive information. */}
      <div
        data-medication-cell="supply"
        className="col-start-2 row-start-1 flex w-[4.75rem] min-w-0 flex-col items-stretch @min-[312px]:col-start-3"
      >
        <div className="flex h-5 items-center">
          <Badge
            variant={badge.variant}
            className={cn(
              "h-5 w-full min-w-0 shrink-0 justify-center overflow-hidden px-1 py-0 text-[0.625rem]",
              showDaysLeftIndicator
                ? getMedicationDaysLeftBadgeClass(medication.daysRemaining!)
                : getMedicationStatusBadgeClass(medication.status),
            )}
          >
            <span className="truncate">{badge.label}</span>
          </Badge>
        </div>
        <div className="flex h-5 min-w-0 items-center justify-end overflow-hidden text-[0.625rem] tabular-nums text-muted-foreground/75">
          {refillCompact && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="max-w-full truncate" tabIndex={0}>
                  {refillCompact}
                </span>
              </TooltipTrigger>
              <TooltipContent
                className={cn(
                  clinicalTooltipSurfaceClass,
                  "max-w-[min(90vw,20rem)] whitespace-normal text-xs leading-relaxed",
                )}
              >
                {refillSummary}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  )
}
