// Medication Item Component — a dense, container-responsive three-lane row.
// Wide: medication/prescription | source/classification | status/refills.
// Each lane has two aligned lines; narrow containers keep the same information
// order while allowing source/diagnosis context to use a full-width line.
//
// Container-query thresholds are in **px**, not rem: the app's root font-size
// is 12px, so a rem threshold silently shifts with the reader's font-size
// setting. The values are the ones the three-lane layout has always used in
// practice (312/336/384/456), now stated literally.
//
// The title keeps the route beside the medication name. Its second line reads
// coverage dates (supply days) → dose → frequency → total quantity. The
// middle lane pairs diagnosis above institution, ATC3, and prescription state.
import type { ReactNode } from 'react'
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { CLINICAL_SOURCE_TONE } from "@/features/clinical-summary/components/clinical-color-roles"
import { clinicalTooltipSurfaceClass } from "@/features/clinical-summary/components/clinical-metadata-styles"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAudience } from "@/src/application/providers/audience.provider"
import { useResourceAnchor } from "@/src/application/hooks/use-resource-anchor.hook"
import type { ResourceNavTarget } from "@/src/application/stores/resource-navigation.store"
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
  /** Optional full-height leading action, used to reveal this current drug's
   *  older prescriptions without duplicating it in the history section. */
  leadingControl?: ReactNode
  /** Makes the non-interactive area of an expandable medication row trigger
   *  the same action as its leading control. Nested controls keep their own
   *  behavior and never bubble into this row action. */
  onRowToggle?: () => void
  /** Runs only after this exact medication row claims a resource-navigation
   *  request, so a parent can open refill details without racing consumption. */
  onResourceNavigationMatch?: (
    sequence: number,
    target: ResourceNavTarget,
  ) => void
  /** Additional MedicationRequest ids represented by this row, such as older
   *  fills hidden inside its refill-history toggle. */
  resourceNavigationIds?: string[]
}

function getStatusBadge(medication: MedicationRow, mt: any) {
  if (medication.isInactive) {
    return { label: mt.statusEnded ?? 'ended', variant: 'secondary' as const }
  }
  const remainingDays = medication.displayRemainingDays ?? medication.daysRemaining
  if (remainingDays !== undefined) {
    if (remainingDays < 0 && medication.displayRemainingSource !== 'cloud-single') {
      return { label: mt.statusOverdue ?? 'overdue', variant: 'outline' as const }
    }
    if (remainingDays === 0 && medication.displayRemainingSource !== 'cloud-single') {
      return { label: mt.statusEndingToday ?? 'ending today', variant: 'outline' as const }
    }
    const template = medication.displayRemainingSource === 'cloud-single'
      ? (mt.singlePrescriptionRemainingCompact ?? mt.daysLeft ?? '{n} days left')
      : (mt.appEstimatedDaysLeft ?? mt.daysLeft ?? '{n} days left')
    return {
      label: template.replace('{n}', String(remainingDays)),
      variant: 'default' as const,
    }
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

export function MedicationItem({
  medication,
  showSourceChip = false,
  sourceChipStatementLabel,
  sourceChipStatementTooltip,
  executionPeriods,
  nameMode = 'ingredient',
  grouped = false,
  leadingControl,
  onRowToggle,
  onResourceNavigationMatch,
  resourceNavigationIds,
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
  const displayedRemainingDays = medication.displayRemainingDays ?? medication.daysRemaining
  const showDaysLeftIndicator =
    displayedRemainingDays !== undefined && !medication.isInactive
  const frequencyTitle = medication.frequency
    ? `${mt.dosageInstructionLabel ?? mt.frequencyLabel ?? '用法用量'}：${medication.frequency}`
    : undefined
  const routeTitle = medication.route
    ? `${mt.routeLabel ?? '途徑'}：${medication.route}`
    : undefined

  // The prescription lane follows the agreed scan order: coverage window,
  // dose, frequency, then dispensed quantity. The coverage date is the flexible
  // segment that yields space first when the middle column narrows.
  const scheduleParts: Array<{
    key: string
    node: React.ReactNode
    fixed: boolean
  }> = []

  const formatCompactNumber = (value: number): string =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value)

  const durationLabel = medication.durationDays !== undefined
    ? (mt.durationCompact ?? (locale.startsWith('zh') ? '{n} 天' : '{n}d'))
      .replace('{n}', formatCompactNumber(medication.durationDays))
    : ''
  const durationSuffix = durationLabel
    ? (locale.startsWith('zh') ? `（${durationLabel}）` : ` (${durationLabel})`)
    : ''

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
    const executionTitle = `${executionLabel}${durationSuffix}`
    scheduleParts.push({
      key: 'execution-period',
      fixed: false,
      node: (
        <span className="block min-w-0 truncate" title={executionTitle}>
          {executionLabel}
          {durationSuffix && (
            <span data-medication-supply-days className="tabular-nums">
              {durationSuffix}
            </span>
          )}
        </span>
      ),
    })
  } else {
    // Generic medication list: keep supply days attached to the coverage
    // window. Inpatient execution dates use the branch above because they are
    // administration windows, not supply coverage.
    const startShort = shortDate(medication.startedOn)
    const endShort = shortDate(medication.endDate)
    if (startShort || endShort) {
      const dateLabel = startShort && endShort
        ? `${startShort} → ${endShort}`
        : (startShort || endShort)
      const dateTitle = `${dateLabel}${durationSuffix}`

      scheduleParts.push({
        key: 'date',
        fixed: false,
        node: (
          <span
            data-testid="medication-schedule-date"
            className="block min-w-0 truncate tabular-nums"
            title={dateTitle}
          >
            {/* Narrow rows show the start date only. The end date is
                recoverable from start + supply days, so dropping it there
                buys the width this lane needs instead of truncating the
                supply window away. The title and the expanded detail keep
                the full range. */}
            {startShort || endShort}
            {startShort && endShort && (
              <span data-medication-schedule-end className="hidden @min-[384px]:inline">
                {` → ${endShort}`}
              </span>
            )}
            {durationSuffix && (
              <span data-medication-supply-days>{durationSuffix}</span>
            )}
          </span>
        ),
      })
    } else if (durationLabel) {
      scheduleParts.push({
        key: 'duration',
        fixed: true,
        node: (
          <span data-medication-supply-days className="tabular-nums">
            {durationLabel}
          </span>
        ),
      })
    }
  }

  if (medication.dose) {
    scheduleParts.push({
      key: 'dose',
      fixed: true,
      node: <span>{medication.dose}</span>,
    })
  }

  if (medication.frequency && frequencyTitle) {
    scheduleParts.push({
      key: 'frequency',
      fixed: true,
      node: (
        <span
          data-medication-frequency
          aria-label={frequencyTitle}
          title={frequencyTitle}
          className="font-normal text-muted-foreground"
        >
          {medication.frequency}
        </span>
      ),
    })
  }

  if (medication.totalQuantity !== undefined) {
    const quantityLabel = (mt.totalQuantityCompact
      ?? (locale.startsWith('zh') ? '總量 {n}' : 'Total {n}'))
      .replace('{n}', formatCompactNumber(medication.totalQuantity))
    scheduleParts.push({
      key: 'total-quantity',
      fixed: true,
      node: (
        <span data-medication-total-quantity className="tabular-nums">
          {quantityLabel}
        </span>
      ),
    })
  }
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
    resourceNavigationIds ?? medication.id,
    onResourceNavigationMatch,
  )

  return (
    <div
      ref={anchorRef}
      data-medication-row-layout="three-lane"
      data-medication-row-toggle={onRowToggle ? 'true' : undefined}
      onClick={onRowToggle ? (event) => {
        const target = event.target as HTMLElement
        const interactiveTarget = target.closest(
          'button, a, input, select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])',
        )
        if (interactiveTarget && event.currentTarget.contains(interactiveTarget)) return
        onRowToggle()
      } : undefined}
      className={cn(
        "relative grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)_4.75rem] gap-x-2 gap-y-0.5 overflow-hidden py-1 leading-tight transition-colors hover:bg-secondary/45 focus-within:bg-secondary/35 @min-[312px]:grid-cols-[minmax(0,1fr)_minmax(7.5rem,1fr)_4.75rem] @min-[336px]:grid-cols-[minmax(0,1fr)_minmax(8.5rem,1.1fr)_4.75rem] @min-[384px]:grid-cols-[minmax(0,1fr)_minmax(10.5rem,1.15fr)_4.75rem] @min-[456px]:grid-cols-[minmax(0,1fr)_minmax(14rem,1.15fr)_4.75rem] @min-[456px]:gap-x-3 dark:hover:bg-secondary/45 dark:focus-within:bg-secondary/35",
        onRowToggle && "cursor-pointer",
        grouped || leadingControl ? "min-h-11 pl-9 pr-3" : "px-3",
        grouped
          ? "rounded-none border-0 bg-transparent"
          : "rounded-md border border-border/70 bg-muted/40 dark:border-border/80 dark:bg-muted/30",
      )}
    >
      {leadingControl && (
        <div className="absolute inset-y-0 left-0 flex w-9 items-stretch">
          {leadingControl}
        </div>
      )}
      {/* Medication/prescription lane: drug + route, then the full regimen. */}
      <div
        data-medication-cell="identity"
        className="min-w-0 overflow-hidden @max-[455px]:contents"
      >
        <div className="col-start-1 row-start-1 flex h-4 min-w-0 items-center">
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
          {medication.route && routeTitle ? (
            <span
              data-medication-route
              aria-label={routeTitle}
              title={routeTitle}
              className="ml-2 shrink-0 text-[0.6875rem] font-semibold text-foreground/80"
            >
              {medication.route}
            </span>
          ) : null}
        </div>

        <div
          data-medication-schedule
          className="col-span-2 col-start-1 row-start-3 flex h-4 min-w-0 items-center overflow-hidden whitespace-nowrap text-[0.6875rem] text-muted-foreground @min-[312px]:col-span-3 @min-[312px]:row-start-2"
        >
          {scheduleParts.map((part, index) => (
            <span
              key={part.key}
              className={cn(
                "inline-flex min-w-0 items-center",
                part.fixed ? "shrink-0" : "shrink",
              )}
            >
              {index > 0 && (
                <span
                  aria-hidden
                  data-medication-frequency-total-gap={
                    part.key === 'total-quantity'
                    && scheduleParts[index - 1]?.key === 'frequency'
                      ? 'true'
                      : undefined
                  }
                  className="whitespace-pre"
                >
                  {part.key === 'total-quantity'
                    && scheduleParts[index - 1]?.key === 'frequency'
                    ? '  '
                    : ' '}
                </span>
              )}
              {part.node}
            </span>
          ))}
        </div>
      </div>

      {/* Diagnosis/classification lane: ICD above institution, source ATC3,
          and prescription-state tags. */}
      <div
        data-medication-cell="clinical"
        className="col-span-2 row-start-2 grid h-8 min-w-0 grid-rows-2 overflow-hidden @min-[312px]:col-span-1 @min-[312px]:col-start-2 @min-[312px]:row-start-1"
      >
        <div
          data-medication-context
          data-medication-diagnosis
          className="row-start-1 flex h-4 min-w-0 items-center overflow-hidden whitespace-nowrap"
        >
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

        <div
          data-medication-classification
          className="row-start-2 flex h-4 min-w-0 items-center gap-1 overflow-hidden"
        >
          {medication.pharmacy && (
            <span
              title={medication.pharmacy}
              className={cn(
                "inline-flex h-4 min-w-0 max-w-[8.5rem] shrink items-center text-[0.6875rem]",
                CLINICAL_SOURCE_TONE,
              )}
            >
              <span className="truncate">{medication.pharmacy}</span>
            </span>
          )}
          {medication.category && (
            <span
              title={medication.category}
              className={cn(medicationCategoryChipClass, "shrink")}
            >
              {medication.category}
            </span>
          )}
          {medication.isChronic && (
            <span
              data-medication-chronic-slot
              data-visible="true"
              title={mt.chronicTooltip ?? 'Continuous long term therapy'}
              className={cn(
                "inline-flex shrink-0 items-center rounded-full border px-1.5 py-0 text-[0.625rem] font-medium",
                medicationChronicBadgeClass,
              )}
            >
              {chronicLabel}
            </span>
          )}
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
      </div>

      {/* Supply lane: a fixed-width status/readout pair. Keeping both values
          in one column prevents short and long medicine names from shifting
          the clinically time-sensitive information. */}
      <div
        data-medication-cell="supply"
        className="col-start-2 row-start-1 flex w-[4.75rem] min-w-0 flex-col items-stretch @min-[312px]:col-start-3"
      >
        <div className="flex h-4 items-center">
          <Badge
            variant={badge.variant}
            className={cn(
              "h-4 w-full min-w-0 shrink-0 justify-center overflow-hidden px-1 py-0 text-[0.625rem]",
              showDaysLeftIndicator
                ? getMedicationDaysLeftBadgeClass(displayedRemainingDays!)
                : getMedicationStatusBadgeClass(
                    medication.isInactive ? 'ended' : medication.status,
                  ),
            )}
          >
            <span className="truncate">{badge.label}</span>
          </Badge>
        </div>
        <div className="flex h-4 min-w-0 items-center justify-end overflow-hidden text-[0.625rem] tabular-nums text-muted-foreground/75">
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
