"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface InstitutionFilterSelectProps {
  value: string
  institutions: string[]
  allLabel: string
  ariaLabel?: string
  onValueChange: (value: string) => void
}

export function InstitutionFilterSelect({
  value,
  institutions,
  allLabel,
  ariaLabel,
  onValueChange,
}: InstitutionFilterSelectProps) {
  const triggerLabel = value === 'all' ? allLabel : value

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        size="sm"
        aria-label={ariaLabel ?? allLabel}
        title={triggerLabel}
        className="min-h-[44px] w-28 shrink-0 bg-background px-2 py-1 text-xs shadow-none data-[size=sm]:h-auto md:min-h-7"
      >
        <SelectValue>
          <span className="block min-w-0 truncate">{triggerLabel}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        align="start"
        className="w-auto min-w-[14rem] max-w-[min(24rem,calc(100vw-1rem))]"
      >
        <SelectItem value="all" className="text-xs">
          {allLabel}
        </SelectItem>
        {institutions.map((institution) => (
          <SelectItem key={institution} value={institution} className="text-xs">
            <span className="max-w-[min(21rem,calc(100vw-4rem))] whitespace-normal break-words">
              {institution}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
