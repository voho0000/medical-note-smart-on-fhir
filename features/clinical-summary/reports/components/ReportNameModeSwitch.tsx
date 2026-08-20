"use client"

import { useId } from 'react'
import { Switch } from '@/components/ui/switch'
import { useLanguage } from '@/src/application/providers/language.provider'
import { cn } from '@/src/shared/utils/cn.utils'
import { useReportNameModeControl } from '../context/report-name-mode.context'

export function ReportNameModeSwitch({
  className,
  responsiveLabels = false,
}: {
  className?: string
  responsiveLabels?: boolean
}) {
  const { t } = useLanguage()
  const { mode, onChange } = useReportNameModeControl()
  const switchId = useId()
  if (!onChange) return null

  const labels = (t.reports as any).nameDisplay || {
    label: '名稱顯示',
    original: '原始名稱',
    originalShort: '原名',
    standardized: '標準化名稱',
    standardizedShort: '標準',
  }

  return (
    <div
      role="group"
      aria-label={labels.label}
      className={cn('inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground md:min-h-[44px] lg:min-h-8', className)}
    >
      <button
        type="button"
        onClick={() => onChange('original')}
        aria-label={labels.original}
        aria-pressed={mode === 'original'}
        className={cn(
          'inline-flex min-h-[36px] items-center rounded-sm px-1.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:min-h-[44px] lg:min-h-8',
          mode === 'original' && 'font-medium text-foreground',
        )}
      >
        {responsiveLabels ? (
          <>
            <span className="@min-[640px]:hidden" aria-hidden="true">
              {labels.originalShort ?? labels.original}
            </span>
            <span className="hidden @min-[640px]:inline" aria-hidden="true">
              {labels.original}
            </span>
          </>
        ) : labels.original}
      </button>
      <label
        htmlFor={switchId}
        className="inline-flex h-[36px] w-[36px] cursor-pointer items-center justify-center md:h-[44px] md:w-[44px] lg:h-8 lg:w-10"
      >
        <Switch
          id={switchId}
          checked={mode === 'standardized'}
          onCheckedChange={(checked) => onChange(checked ? 'standardized' : 'original')}
          aria-label={labels.label}
        />
      </label>
      <button
        type="button"
        onClick={() => onChange('standardized')}
        aria-label={labels.standardized}
        aria-pressed={mode === 'standardized'}
        className={cn(
          'inline-flex min-h-[36px] items-center rounded-sm px-1.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:min-h-[44px] lg:min-h-8',
          mode === 'standardized' && 'font-medium text-foreground',
        )}
      >
        {responsiveLabels ? (
          <>
            <span className="@min-[640px]:hidden" aria-hidden="true">
              {labels.standardizedShort ?? labels.standardized}
            </span>
            <span className="hidden @min-[640px]:inline" aria-hidden="true">
              {labels.standardized}
            </span>
          </>
        ) : labels.standardized}
      </button>
    </div>
  )
}
