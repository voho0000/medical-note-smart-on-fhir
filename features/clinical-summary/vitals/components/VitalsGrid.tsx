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

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <VitalItem label={t.vitals.height} value={vitals.height} />
        <VitalItem label={t.vitals.weight} value={vitals.weight} />
        <VitalItem label={t.vitals.bmi} value={vitals.bmi} />
        <VitalItem label={t.vitals.bp} value={vitals.bp} />
        <VitalItem label={t.vitals.hr} value={vitals.hr} />
        <VitalItem label={t.vitals.rr} value={vitals.rr} />
        <VitalItem label={t.vitals.temp} value={vitals.temp} />
        <VitalItem label={t.vitals.spo2} value={vitals.spo2} />
      </div>
      {vitals.time && (
        <div className="text-xs text-muted-foreground">Last updated: {vitals.time}</div>
      )}
    </div>
  )
}
