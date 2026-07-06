// Vitals Grid Component
//
// Flat, low-chrome layout: each vital is a label-then-value pair laid out
// horizontally with subtle dot separators. No nested borders / cards. The
// label is muted, the value is foreground-emphasized.
import type { VitalsView } from '../types'
import { useLanguage } from '@/src/application/providers/language.provider'
import { Ruler, Weight, Activity, Heart } from 'lucide-react'

interface VitalsGridProps {
  vitals: VitalsView
  isLoading: boolean
  error: Error | null
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  const empty = !value || value === '—'
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      {Icon && (
        <Icon className="h-4 w-4 self-center text-muted-foreground/80" />
      )}
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={
          empty
            ? 'text-base font-semibold tabular-nums text-muted-foreground/60'
            : 'text-base font-semibold tabular-nums'
        }
      >
        {value || '—'}
      </span>
    </span>
  )
}

function Sep() {
  return <span className="text-muted-foreground/40 select-none">·</span>
}

export function VitalsGrid({ vitals, isLoading, error }: VitalsGridProps) {
  const { t } = useLanguage()

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">{t.common.loading}</div>
  }

  if (error) {
    return <div className="text-sm text-red-600">{error.message}</div>
  }

  // Show only the static / slow-changing measurements. RR / Temp / SpO2 are
  // realtime vitals where a historical value isn't clinically useful in this
  // summary view — omit them entirely.
  return (
    <div className="space-y-1 leading-tight">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Stat icon={Ruler}    label={t.vitals.height} value={vitals.height} />
        <Sep />
        <Stat icon={Weight}   label={t.vitals.weight} value={vitals.weight} />
        <Sep />
        <Stat icon={Activity} label={t.vitals.bmi}    value={vitals.bmi} />
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Stat icon={Heart}    label={t.vitals.bp} value={vitals.bp} />
        <Sep />
        <Stat                 label={t.vitals.hr} value={vitals.hr} />
      </div>
      {vitals.time && (
        <div className="text-xs text-muted-foreground/80 pt-0.5">
          {vitals.time}
        </div>
      )}
    </div>
  )
}
