// Vitals Grid Component
import type { VitalsView } from '../types'
import { VitalItem } from './VitalItem'
import { useLanguage } from '@/src/application/providers/language.provider'

interface VitalsGridProps {
  vitals: VitalsView
  isLoading: boolean
  error: Error | null
}

export function VitalsGrid({ vitals, isLoading, error }: VitalsGridProps) {
  const { t } = useLanguage()
  
  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading vitals…</div>
  }
  
  if (error) {
    return <div className="text-sm text-red-600">{error.message}</div>
  }

  // Show only the static / slow-changing measurements. RR / Temp / SpO2 are
  // realtime vitals where a historical value isn't clinically useful in this
  // summary view — omit them entirely.
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-3 gap-1">
        <VitalItem label={t.vitals.height} value={vitals.height} />
        <VitalItem label={t.vitals.weight} value={vitals.weight} />
        <VitalItem label={t.vitals.bmi}    value={vitals.bmi} />
      </div>
      <div className="grid grid-cols-2 gap-1">
        <VitalItem label={t.vitals.bp} value={vitals.bp} />
        <VitalItem label={t.vitals.hr} value={vitals.hr} />
      </div>
      {vitals.time && (
        <div className="text-[10px] text-muted-foreground leading-tight">Last updated: {vitals.time}</div>
      )}
    </div>
  )
}
