// Vital Item Component — compact inline label:value to keep the vitals
// card short so the cards below it (problem list, etc.) are visible without
// scrolling.
interface VitalItemProps {
  label: string
  value: string
}

export function VitalItem({ label, value }: VitalItemProps) {
  return (
    <div className="rounded-md border px-2 py-0.5 leading-tight">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-[13px] font-semibold tabular-nums whitespace-nowrap">{value}</div>
    </div>
  )
}
