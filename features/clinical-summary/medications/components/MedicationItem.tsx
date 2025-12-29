// Medication Item Component
import { Badge } from "@/components/ui/badge"
import type { MedicationRow } from '../types'

interface MedicationItemProps {
  medication: MedicationRow
}

export function MedicationItem({ medication }: MedicationItemProps) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between">
        <div className="font-medium">{medication.title}</div>
        <Badge 
          variant={
            medication.status === 'active' ? 'default' : 
            medication.status === 'completed' || medication.status === 'stopped' ? 'secondary' : 'outline'
          }
          className="ml-2 capitalize"
        >
          {medication.status}
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
      
      {(medication.startedOn || medication.stoppedOn || medication.durationDays) && (
        <div className="mt-1 space-y-1 text-xs text-muted-foreground">
          {medication.startedOn && <div>Start date: {medication.startedOn}</div>}
          {medication.stoppedOn && <div>Stop date: {medication.stoppedOn}</div>}
          {medication.durationDays && <div>Prescription length: {medication.durationDays} days</div>}
        </div>
      )}
    </div>
  )
}
