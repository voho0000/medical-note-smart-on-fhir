// Vital Item Component
interface VitalItemProps {
  label: string
  value: string
}

export function VitalItem({ label, value }: VitalItemProps) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-medium">{value}</div>
    </div>
  )
}
