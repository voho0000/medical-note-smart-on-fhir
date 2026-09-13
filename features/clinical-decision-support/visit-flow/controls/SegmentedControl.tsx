"use client"

import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { cn } from '@/src/shared/utils/cn.utils'

/**
 * One question, one row of mutually exclusive answers.
 *
 * The same control the heart-failure flow has always drawn: 有／無／未評估 on
 * an examination row, I–IV on an NYHA grade, 可耐受／不耐受 on a statin. The
 * options and their wording belong to the question; this only lays them out.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onSelect,
  testId,
  disabled,
  equalWidth = false,
  tooltipPrefix,
}: {
  label: string
  options: readonly { id: T; text: string; description?: string }[]
  value: T | null
  onSelect: (next: T) => void
  testId: string
  disabled?: boolean
  equalWidth?: boolean
  /** 「NYHA II」 — what the tooltip names before the option's own text. */
  tooltipPrefix?: string
}) {
  return (
    <div
      className={cn("shrink-0 overflow-hidden rounded-md border border-border", equalWidth ? "inline-grid w-fit max-w-full grid-flow-col auto-cols-fr" : "flex")}
      role="group"
      aria-label={label}
      data-testid={testId}
    >
      {options.map((option) => {
        const isSelected = value === option.id
        const button = (
          <button
            key={option.id}
            type="button"
            aria-pressed={isSelected}
            disabled={disabled}
            className={cn(
              'min-h-8 min-w-[2.5rem] px-2.5 text-xs font-medium transition-colors',
              'border-r border-border last:border-r-0',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              'disabled:cursor-not-allowed disabled:opacity-50',
              isSelected
                ? 'bg-primary/10 text-primary'
                : 'bg-card text-muted-foreground hover:bg-muted/40',
            )}
            onClick={() => onSelect(option.id)}
            data-testid={`${testId}-${option.id}`}
          >
            {option.text}
          </button>
        )
        return option.description ? (
          <Tooltip key={option.id}>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="top" sideOffset={6} className="max-w-72 leading-relaxed">
              <span className="font-semibold">{tooltipPrefix ? `${tooltipPrefix} ` : ''}{option.text}</span><br />{option.description}
            </TooltipContent>
          </Tooltip>
        ) : button
      })}
    </div>
  )
}
