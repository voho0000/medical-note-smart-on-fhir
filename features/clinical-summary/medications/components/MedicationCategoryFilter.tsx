"use client"

import { useState } from 'react'
import { ChevronDown, ListFilter, Search, X } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/src/shared/utils/cn.utils'

export const UNCATEGORIZED_MEDICATION_KEY = '__uncategorized__'

export interface MedicationCategoryOption {
  value: string
  label: string
  count: number
  priority?: boolean
}

interface MedicationCategoryFilterProps {
  label: string
  clearLabel: string
  selectedCountLabel: string
  priorityGroupLabel: string
  otherGroupLabel: string
  searchPlaceholder: string
  searchClearLabel: string
  noMatchesLabel: string
  options: MedicationCategoryOption[]
  selected: ReadonlySet<string>
  onSelectedChange: (selected: Set<string>) => void
  className?: string
}

export function MedicationCategoryFilter({
  label,
  clearLabel,
  selectedCountLabel,
  priorityGroupLabel,
  otherGroupLabel,
  searchPlaceholder,
  searchClearLabel,
  noMatchesLabel,
  options,
  selected,
  onSelectedChange,
  className,
}: MedicationCategoryFilterProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
  const visibleOptions = normalizedQuery
    ? options.filter((option) => option.label.toLocaleLowerCase().includes(normalizedQuery))
    : options
  const priorityOptions = visibleOptions.filter((option) => option.priority)
  const otherOptions = visibleOptions.filter((option) => !option.priority)
  const toggle = (value: string) => {
    const next = new Set(selected)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onSelectedChange(next)
  }

  const renderOptions = (groupOptions: MedicationCategoryOption[]) => groupOptions.map((option) => (
    <label
      key={option.value}
      className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/70"
    >
      <Checkbox
        checked={selected.has(option.value)}
        onCheckedChange={() => toggle(option.value)}
        aria-label={option.label}
      />
      <span className="min-w-0 flex-1 break-words">{option.label}</span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{option.count}</span>
    </label>
  ))

  return (
    <Popover onOpenChange={(open) => {
      if (!open) setSearchQuery('')
    }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            'inline-flex h-[36px] shrink-0 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-auto md:py-1',
            selected.size > 0 && 'border-primary bg-primary/5 font-medium text-primary',
            className,
          )}
        >
          <ListFilter className="h-3.5 w-3.5" aria-hidden />
          <span>{label}</span>
          {selected.size > 0 && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0 text-[0.6875rem] tabular-nums">
              {selectedCountLabel.replace('{count}', String(selected.size))}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex min-h-12 items-center gap-2 border-b px-3 py-2">
          <span className="shrink-0 text-sm font-semibold">{label}</span>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-9 w-full rounded-md border bg-background pl-7 pr-7 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring max-md:text-[16px] [&::-webkit-search-cancel-button]:appearance-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label={searchClearLabel}
                className="absolute right-0 top-1/2 inline-flex min-h-9 min-w-9 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => onSelectedChange(new Set())}
              aria-label={clearLabel}
              title={clearLabel}
              className="inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
        <div className="max-h-[min(24rem,60vh)] overflow-y-auto p-1.5" role="group" aria-label={label}>
          {priorityOptions.length > 0 && (
            <section aria-label={priorityGroupLabel}>
              <div className="px-2 pb-1 pt-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                {priorityGroupLabel}
              </div>
              {renderOptions(priorityOptions)}
            </section>
          )}
          {otherOptions.length > 0 && (
            <section aria-label={otherGroupLabel} className={cn(priorityOptions.length > 0 && 'mt-1 border-t pt-1')}>
              {priorityOptions.length > 0 && (
                <div className="px-2 pb-1 pt-0.5 text-xs font-medium text-muted-foreground">
                  {otherGroupLabel}
                </div>
              )}
              {renderOptions(otherOptions)}
            </section>
          )}
          {visibleOptions.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground" role="status">
              {noMatchesLabel}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
