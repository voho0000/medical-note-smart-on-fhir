// Medication Item Component
import { Badge } from "@/components/ui/badge"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAudience } from "@/src/application/providers/audience.provider"
import type { MedicationRow } from '../types'

interface MedicationItemProps {
  medication: MedicationRow
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

export function MedicationItem({ medication }: MedicationItemProps) {
  const { t } = useLanguage()
  const { audience } = useAudience()
  const badge = getStatusBadge(medication)
  const mt = (t.medications as any)

  const isMedical = audience === 'medical'
  // Refill-history summary inline. Pharmacy + count are useful for both
  // audiences; ICD reason is shown only to medical professionals (a patient
  // looking at "N40.0" gets nothing from the code).
  const showRefillRow = !!(medication.pharmacy || medication.refillCount > 1)

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="font-medium">{medication.title}</span>
          {medication.isChronic && (
            <span
              title={mt.chronicTooltip ?? 'Continuous long term therapy'}
              className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700"
            >
              {mt.chronic ?? '慢箋'}
            </span>
          )}
        </div>
        <Badge variant={badge.variant} className="ml-2 capitalize shrink-0">
          {badge.label}
        </Badge>
      </div>

      {(medication.dose || medication.frequency || medication.route || medication.detail) && (
        <div className="mt-1 grid gap-1 text-sm text-muted-foreground">
          {medication.dose && <div>Dose: {medication.dose}</div>}
          {medication.frequency && <div>Frequency: {medication.frequency}</div>}
          {medication.route && <div>Route: {medication.route}</div>}
          {medication.detail && <div>Notes: {medication.detail}</div>}
        </div>
      )}

      {(medication.startedOn || medication.endDate || medication.durationDays) && (
        <div className="mt-1 space-y-1 text-xs text-muted-foreground">
          {medication.startedOn && <div>Start: {medication.startedOn}</div>}
          {medication.endDate && (
            <div>{medication.isInactive ? 'Ended' : 'Until'}: {medication.endDate}</div>
          )}
          {medication.durationDays && <div>Prescription length: {medication.durationDays} days</div>}
        </div>
      )}

      {showRefillRow && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t pt-1.5 text-xs text-muted-foreground">
          {medication.pharmacy && (
            <span>
              <span className="font-medium text-foreground/70">
                {mt.pharmacyLabel ?? 'Dispensed at'}:
              </span>{' '}
              {medication.pharmacy}
            </span>
          )}
          {isMedical && medication.icdCode && (
            <span>
              <span className="font-medium text-foreground/70">
                {mt.indicationLabel ?? 'For'}:
              </span>{' '}
              <span className="font-mono">{medication.icdCode}</span>
              {medication.icdText && <span className="ml-1">{medication.icdText}</span>}
            </span>
          )}
          {medication.refillCount > 1 && (
            <span>
              <span className="font-medium text-foreground/70">
                {mt.refillsLabel ?? 'Refills'}:
              </span>{' '}
              {medication.refillCount} {mt.refillTimes ?? 'times'}
              {medication.firstRefillDate && (
                <span className="ml-1">
                  ({mt.refillsSince ?? 'since'} {medication.firstRefillDate})
                </span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
