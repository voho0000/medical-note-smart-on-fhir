"use client"

// Generic, metadata-driven filter controls. Reads a category's `filters`
// declaration (CategoryFilter[]) and renders one compact Select per filter —
// so any category (including new ones) gets filter UI for free, no bespoke
// component per category. Option labels are localized from a small value map.
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { useLanguage } from "@/src/application/providers/language.provider"
import type { DataCategory, FilterValue } from "@/src/core/interfaces/data-category.interface"

const VALUE_LABELS: Record<string, { zh: string; en: string }> = {
  latest: { zh: '最新', en: 'Latest' },
  all: { zh: '全部', en: 'All' },
  active: { zh: '作用中', en: 'Active' },
  chronic: { zh: '慢箋', en: 'Chronic' },
  acute: { zh: '急性', en: 'Acute' },
  '24h': { zh: '24 小時', en: '24h' },
  '3d': { zh: '3 天', en: '3d' },
  '1w': { zh: '1 週', en: '1w' },
  '1m': { zh: '1 個月', en: '1m' },
  '3m': { zh: '3 個月', en: '3m' },
  '6m': { zh: '6 個月', en: '6m' },
  '1y': { zh: '1 年', en: '1y' },
  '3y': { zh: '3 年', en: '3y' },
  '5y': { zh: '5 年', en: '5y' },
  sinceLastVisit: { zh: '上次就醫以來', en: 'Since last visit' },
  // Lab trend-depth options (labTrendPoints)
  '4': { zh: '4 點', en: '4 pts' },
  '8': { zh: '8 點', en: '8 pts' },
  '16': { zh: '16 點', en: '16 pts' },
}

interface CategoryFilterControlsProps {
  category: DataCategory
  filters: Record<string, FilterValue>
  onFilterChange: (key: string, value: FilterValue) => void
}

export function CategoryFilterControls({ category, filters, onFilterChange }: CategoryFilterControlsProps) {
  const { locale } = useLanguage()
  const isZh = locale.startsWith('zh')
  const label = (value: string, fallback: string) => {
    const entry = VALUE_LABELS[value]
    return entry ? (isZh ? entry.zh : entry.en) : fallback
  }

  if (!category.filters?.length) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {category.filters.map((filter) => {
        const current = String(filters[filter.key] ?? filter.defaultValue)
        return (
          <Select
            key={filter.key}
            value={current}
            onValueChange={(v) => onFilterChange(filter.key, v)}
          >
            <SelectTrigger className="h-7 w-auto gap-1 rounded-full border-border/70 px-2.5 text-[0.6875rem] text-muted-foreground">
              <span>{label(current, current)}</span>
            </SelectTrigger>
            <SelectContent align="start" className="text-xs">
              {(filter.options ?? []).map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {label(opt.value, opt.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      })}
    </div>
  )
}
