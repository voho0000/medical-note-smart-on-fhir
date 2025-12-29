// Vitals Grid Component
import type { VitalsView } from '../types'
import { VitalItem } from './VitalItem'

interface VitalsGridProps {
  vitals: VitalsView
  isLoading: boolean
  error: Error | null
}

export function VitalsGrid({ vitals, isLoading, error }: VitalsGridProps) {
  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading vitals…</div>
  }
  
  if (error) {
    return <div className="text-sm text-red-600">{error.message}</div>
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <VitalItem label="Height" value={vitals.height} />
        <VitalItem label="Weight" value={vitals.weight} />
        <VitalItem label="BMI" value={vitals.bmi} />
        <VitalItem label="BP" value={vitals.bp} />
        <VitalItem label="HR" value={vitals.hr} />
        <VitalItem label="RR" value={vitals.rr} />
        <VitalItem label="Temp" value={vitals.temp} />
        <VitalItem label="SpO₂" value={vitals.spo2} />
      </div>
      {vitals.time && (
        <div className="text-xs text-muted-foreground">Last updated: {vitals.time}</div>
      )}
    </div>
  )
}
