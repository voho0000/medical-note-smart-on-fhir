// Medication Item Component — dense 2-line layout so 10+ drugs fit on screen.
// Line 1: drug name (truncate) + chronic badge + status badge
// Line 2: dose · freq · route · date range · pharmacy · billing ICD (medical) · refill count
import { Badge } from "@/components/ui/badge"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAudience } from "@/src/application/providers/audience.provider"
import type { MedicationRow } from '../types'

interface MedicationItemProps {
  medication: MedicationRow
  /** Renders a "目前服用" chip on rows whose sourceResourceType is
   *  MedicationStatement. Driven from MedListCard's mixed-source detection
   *  — for the bridge default (all MedicationRequest) it stays off. */
  showSourceChip?: boolean
  sourceChipStatementLabel?: string
  sourceChipStatementTooltip?: string
}

function getStatusBadge(medication: MedicationRow) {
  if (medication.isInactive) {
    return { label: medication.status === 'active' ? 'ended' : medication.status, variant: 'secondary' as const }
  }
  if (medication.daysRemaining !== undefined) {
    if (medication.daysRemaining <= 0) {
      return { label: 'ending today', variant: 'outline' as const }
    }
    return { label: `${medication.daysRemaining}d left`, variant: 'default' as const }
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

function Sep() {
  return <span className="text-muted-foreground/40 select-none" aria-hidden>·</span>
}

export function MedicationItem({
  medication,
  showSourceChip = false,
  sourceChipStatementLabel,
  sourceChipStatementTooltip,
}: MedicationItemProps) {
  const { t } = useLanguage()
  const { audience } = useAudience()
  const badge = getStatusBadge(medication)
  const mt = (t.medications as any)
  const isMedical = audience === 'medical'
  const showStatementChip =
    showSourceChip && medication.sourceResourceType === 'MedicationStatement'

  // ── Line-2 inline parts (collapse empties) ────────────────────────────
  // Single-word dose/freq/route join into "5mg · PO · QD"; date range and
  // refill stats follow. Anything missing is silently skipped.
  const parts: React.ReactNode[] = []
  if (medication.dose) parts.push(<span key="dose">{medication.dose}</span>)
  if (medication.route) parts.push(<span key="route">{medication.route}</span>)
  if (medication.frequency) parts.push(<span key="freq">{medication.frequency}</span>)

  // Date range: prefer "start → end" for active, "ended end" for inactive.
  const startShort = shortDate(medication.startedOn)
  const endShort = shortDate(medication.endDate)
  if (startShort || endShort) {
    let dateLabel: string
    if (medication.isInactive && endShort) {
      dateLabel = `ended ${endShort}`
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

  if (medication.pharmacy) {
    parts.push(<span key="pharm">{medication.pharmacy}</span>)
  }
  if (isMedical && medication.icdCode) {
    parts.push(
      <span key="icd" title={mt.billingIcdTooltip} className="cursor-help">
        <span className="font-mono">{medication.icdCode}</span>
        {medication.icdText && <span className="ml-1">{medication.icdText}</span>}
      </span>
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

  return (
    <div className="rounded-md border px-2.5 py-1 leading-tight">
      {/* ── Line 1 ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span
            className="text-[13px] font-semibold truncate"
            title={medication.title}
          >
            {medication.title}
          </span>
          {medication.category && (
            <span
              title={medication.category}
              className="inline-flex shrink-0 max-w-[10rem] items-center rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0 text-[10px] font-medium text-slate-700 truncate"
            >
              {medication.category}
            </span>
          )}
          {medication.isChronic && (
            <span
              title={mt.chronicTooltip ?? 'Continuous long term therapy'}
              className="inline-flex shrink-0 items-center rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0 text-[10px] font-medium text-violet-700"
            >
              {mt.chronic ?? '慢箋'}
            </span>
          )}
          {showStatementChip && (
            <span
              title={sourceChipStatementTooltip ?? 'MedicationStatement (currently taking, per source)'}
              className="inline-flex shrink-0 items-center rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0 text-[10px] font-medium text-sky-700"
            >
              {sourceChipStatementLabel ?? '目前服用'}
            </span>
          )}
        </div>
        <Badge variant={badge.variant} className="ml-1 capitalize shrink-0 text-[10px] px-1.5 py-0">
          {badge.label}
        </Badge>
      </div>

      {/* ── Line 2 (compact metadata) ──────────────────────────────────── */}
      {parts.length > 0 && (
        <div className="mt-0 flex flex-wrap items-center gap-x-1.5 gap-y-0 text-[10px] text-muted-foreground">
          {parts.map((node, i) => (
            <span key={i} className="inline-flex items-center gap-x-1.5">
              {i > 0 && <Sep />}
              {node}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
