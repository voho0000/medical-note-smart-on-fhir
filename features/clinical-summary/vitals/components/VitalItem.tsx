// Vital Item Component — compact inline label:value to keep the vitals
// card short so the cards below it (problem list, etc.) are visible without
// scrolling.
interface VitalItemProps {
  label: string
  value: string
}

export function VitalItem({ label, value }: VitalItemProps) {
  return (
    <div className="flex items-baseline justify-between gap-2 rounded-md border px-2 py-1">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium tabular-nums truncate">{value}</span>
    </div>
  )
}
