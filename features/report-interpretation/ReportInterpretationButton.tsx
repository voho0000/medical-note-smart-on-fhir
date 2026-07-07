// The 「AI 翻譯解讀」toggle that sits in a report's header action area. Low-key
// ghost styling (colours only on hover / when active) so that a patient with
// dozens of reports doesn't see a wall of loud buttons — the button is discreet
// until reached for. Purely presentational: the host owns the open/closed state
// and renders <ReportInterpretationPanel> below the report body when active.
'use client'

import { Languages } from 'lucide-react'
import { cn } from '@/src/shared/utils/cn.utils'
import { useLanguage } from '@/src/application/providers/language.provider'

interface ReportInterpretationButtonProps {
  active: boolean
  onToggle: (e: React.MouseEvent) => void
  className?: string
}

export function ReportInterpretationButton({
  active,
  onToggle,
  className,
}: ReportInterpretationButtonProps) {
  const { locale } = useLanguage()
  const label = locale === 'zh-TW' ? 'AI 翻譯解讀' : 'AI translate & explain'
  const activeLabel = locale === 'zh-TW' ? '收合翻譯解讀' : 'Hide translation'
  return (
    <button
      type="button"
      onClick={onToggle}
      title={active ? activeLabel : label}
      aria-label={active ? activeLabel : label}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-transparent text-muted-foreground hover:bg-muted hover:text-primary',
        className,
      )}
    >
      <Languages className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
