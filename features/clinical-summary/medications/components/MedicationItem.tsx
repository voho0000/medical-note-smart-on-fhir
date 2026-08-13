// Medication Item Component — dense 2-line layout so 10+ drugs fit on screen.
// Line 1: drug name (truncate) + chronic badge + status badge
// Line 2: dose · freq · route · date range · pharmacy · ATC/ICD (medical) · refill count
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAudience } from "@/src/application/providers/audience.provider"
import { useResourceAnchor } from "@/src/application/hooks/use-resource-anchor.hook"
import { cn } from "@/src/shared/utils/cn.utils"
import { formatDate as formatCalendarDate } from "@/src/shared/utils/date.utils"
import type { MedicationExecutionPeriod, MedicationRow } from '../types'
import {
  medicationCategoryChipClass,
  medicationDaysLeftBadgeClass,
  medicationIcdChipClass,
  medicationIcdTextClass,
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

function Sep() {
  return <span className="text-muted-foreground/40 select-none" aria-hidden>·</span>
}

export function MedicationItem({
  medication,
  showSourceChip = false,
  sourceChipStatementLabel,
  sourceChipStatementTooltip,
  executionPeriods,
}: MedicationItemProps) {
  const { t, locale } = useLanguage()
  const { audience } = useAudience()
  const mt = (t.medications as any)
  const badge = getStatusBadge(medication, mt)
  const isMedical = audience === 'medical'
  const showStatementChip =
    showSourceChip && medication.sourceResourceType === 'MedicationStatement'
  const billingIcdTitle = medication.icdCode
    ? `${medication.icdCode}${medication.icdText ? ` ${medication.icdText}` : ''}`
    : mt.billingIcdTooltip
  const showDaysLeftBadge =
    !medication.isInactive &&
    medication.daysRemaining !== undefined &&
    medication.daysRemaining > 0
  const terminology = medication.drugTerminology
  const fullMedicationTitle = [
    medication.title,
    medication.secondaryTitle,
    terminology?.atcCode ? `ATC ${terminology.atcCode}` : undefined,
  ].filter(Boolean).join(' · ')

  // ── Line-2 inline parts (collapse empties) ────────────────────────────
  // Single-word dose/freq/route join into "5mg · PO · QD"; date range and
  // refill stats follow. Anything missing is silently skipped.
  const parts: React.ReactNode[] = []
  if (medication.dose) parts.push(<span key="dose">{medication.dose}</span>)
  if (medication.route) parts.push(<span key="route">{medication.route}</span>)
  if (medication.frequency) parts.push(<span key="freq">{medication.frequency}</span>)

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
    parts.push(
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
      let dateLabel: string
      if (medication.isInactive && endShort) {
        dateLabel = `${mt.endedPrefix ?? 'ended'} ${endShort}`
      } else if (startShort && endShort) {
        dateLabel = `${startShort} → ${endShort}`
      } else if (startShort) {
        dateLabel = startShort
      } else {
        dateLabel = endShort
      }
      if (medication.durationDays && !medication.isInactive) {
        dateLabel += ` (${medication.durationDays}d)`
      }
      parts.push(<span key="date">{dateLabel}</span>)
    }
  }

  if (medication.pharmacy) {
    parts.push(
      <span
        key="pharm"
        title={medication.pharmacy}
        className="inline-flex h-5 max-w-[8rem] items-center rounded-md border border-border bg-muted px-1.5 py-0 text-[0.6875rem] text-muted-foreground"
      >
        <span className="truncate">{medication.pharmacy}</span>
      </span>
    )
  }
  if (isMedical && medication.icdCode) {
    parts.push(
      <Tooltip key="icd">
        <TooltipTrigger asChild>
          <span
            aria-label={billingIcdTitle}
            tabIndex={0}
            className={medicationIcdChipClass}
          >
            <span className="font-mono">{medication.icdCode}</span>
            {medication.icdText && <span className={medicationIcdTextClass}>{medication.icdText}</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[min(90vw,28rem)] whitespace-normal break-words text-xs leading-relaxed">
          {billingIcdTitle}
        </TooltipContent>
      </Tooltip>
    )
  }
  if (medication.refillCount > 1) {
    const since = medication.firstRefillDate ? ` ${mt.refillsSince ?? 'since'} ${shortDate(medication.firstRefillDate)}` : ''
    parts.push(
      <span key="refill">
        {medication.refillCount} {mt.refillTimes ?? 'times'}{since}
      </span>
    )
  }

  // Resource-navigation anchor — catalog cites MedicationRequest OR
  // MedicationStatement, so this row answers to both.
  const anchorRef = useResourceAnchor(
    ['MedicationRequest', 'MedicationStatement'],
    medication.id,
  )

  return (
    <div
      ref={anchorRef}
      className="w-full min-w-0 max-w-full overflow-hidden rounded-md border px-2.5 py-1 leading-tight"
    >
      {/* ── Line 1 ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
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
                className={cn(
                  "truncate text-[0.8125rem] font-semibold",
                  medication.secondaryTitle ? "max-w-[62%] shrink-0" : "min-w-0",
                )}
              >
                {medication.title}
              </span>
              {isMedical && medication.secondaryTitle && (
                <span className="min-w-0 truncate text-[0.6875rem] font-normal text-muted-foreground">
                  · {medication.secondaryTitle}
                </span>
              )}
            </span>
          </MedicationTerminologyTooltip>
          {medication.category && (
            <span
              title={medication.category}
              className={medicationCategoryChipClass}
            >
              {medication.category}
            </span>
          )}
          {medication.isChronic && (
            <span
              title={mt.chronicTooltip ?? 'Continuous long term therapy'}
              className="inline-flex shrink-0 items-center rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0 text-[0.625rem] font-medium text-violet-700 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300"
            >
              {mt.chronic ?? '慢箋'}
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
              className="inline-flex shrink-0 items-center rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0 text-[0.625rem] font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
            >
              {mt.renewed ?? '已續領'}
            </span>
          )}
          {showStatementChip && (
            <span
              title={sourceChipStatementTooltip ?? 'MedicationStatement (currently taking, per source)'}
              className="inline-flex shrink-0 items-center rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0 text-[0.625rem] font-medium text-sky-700 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300"
            >
              {sourceChipStatementLabel ?? '目前服用'}
            </span>
          )}
        </div>
        <Badge
          variant={badge.variant}
          className={cn(
            "ml-1 capitalize shrink-0 text-[0.625rem] px-1.5 py-0",
            showDaysLeftBadge && medicationDaysLeftBadgeClass,
          )}
        >
          {badge.label}
        </Badge>
      </div>

      {/* ── Line 2 (compact metadata) ──────────────────────────────────── */}
      {parts.length > 0 && (
        <div className="mt-0 flex flex-nowrap items-center gap-x-1 overflow-hidden whitespace-nowrap text-[0.625rem] text-muted-foreground">
          {parts.map((node, i) => (
            <span key={i} className="inline-flex min-w-0 items-center gap-x-1">
              {i > 0 && <Sep />}
              {node}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
