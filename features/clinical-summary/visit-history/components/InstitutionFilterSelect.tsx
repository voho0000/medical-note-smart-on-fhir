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
      {/* Phone: a single fixed 5.25rem box — narrower than the old 7rem so the
          freed width goes to the content chips further along the single-line
          filter strip, but FIXED rather than content-sized, so the strip never
          reflows when an institution is picked. The width is in REM because the
          root font-size is user-settable (font-size.provider.tsx, 12–20px) and
          text-xs scales with it; a literal px box would truncate 機構 to 機.∨
          once the user enlarges the type. 5.25rem = 63px at the 12px phone
          baseline, 84px at 16 — always clear of the 2-glyph 機構 label, which
          needs 47px @12 and 62px @16. The exact value is what makes the strip
          fit its MEASURED 305px at root 12 / 375px:
          48 (醫別) + 48 (類型) + 63 (機構) + 4×32 (chips) + 6 gaps ×3 = 305px.
          A selected institution truncates inside the same box and the `title`
          still carries the full FHIR name.
          md+ keeps the original fixed 7rem column so the desktop row is stable. */}
      <SelectTrigger
        size="sm"
        aria-label={ariaLabel ?? allLabel}
        title={triggerLabel}
        className="min-h-[36px] w-[5.25rem] min-w-[5.25rem] max-w-[5.25rem] shrink-0 bg-background px-1.5 py-0 text-xs shadow-none data-[size=sm]:h-auto md:min-h-7 md:w-28 md:min-w-28 md:max-w-28 md:px-2 md:py-1"
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
