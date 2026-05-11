// Medication Item Component
import { Badge } from "@/components/ui/badge"
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
  const badge = getStatusBadge(medication)

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between">
        <div className="font-medium">{medication.title}</div>
        <Badge variant={badge.variant} className="ml-2 capitalize">
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
    </div>
  )
}
