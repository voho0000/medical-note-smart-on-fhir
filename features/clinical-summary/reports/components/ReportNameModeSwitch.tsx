"use client"

import { Switch } from '@/components/ui/switch'
import { useLanguage } from '@/src/application/providers/language.provider'
import { cn } from '@/src/shared/utils/cn.utils'
import { useReportNameModeControl } from '../context/report-name-mode.context'

export function ReportNameModeSwitch({ className }: { className?: string }) {
  const { t } = useLanguage()
  const { mode, onChange } = useReportNameModeControl()
  if (!onChange) return null

  const labels = (t.reports as any).nameDisplay || {
    label: '名稱顯示',
    original: '原始名稱',
    standardized: '標準化名稱',
  }

  return (
    <div className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground', className)}>
      <button
        type="button"
        onClick={() => onChange('original')}
        className={mode === 'original' ? 'font-medium text-foreground' : 'hover:text-foreground'}
      >
        {labels.original}
      </button>
      <Switch
        checked={mode === 'standardized'}
        onCheckedChange={(checked) => onChange(checked ? 'standardized' : 'original')}
        aria-label={labels.label}
        className="scale-90"
      />
      <button
        type="button"
        onClick={() => onChange('standardized')}
        className={mode === 'standardized' ? 'font-medium text-foreground' : 'hover:text-foreground'}
      >
        {labels.standardized}
      </button>
    </div>
  )
}
