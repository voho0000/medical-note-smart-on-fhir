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
  /** Render as a div[role=button] instead of a <button>. Needed when the host
   *  header is itself a <button> (e.g. a Radix AccordionTrigger on a panel
   *  report) — a nested <button> is invalid HTML. Defaults to a real <button>. */
  asDiv?: boolean
}

export function ReportInterpretationButton({
  active,
  onToggle,
  className,
  asDiv,
}: ReportInterpretationButtonProps) {
  const { locale } = useLanguage()
  const label = locale === 'zh-TW' ? 'AI 翻譯解讀' : 'AI translate & explain'
  // Shorter label for phones (<sm), where the report row header is tight. This
  // feature's primary audience is 民眾 on mobile, so the AI entry point must
  // never collapse to a bare icon (which they can't decode) — a short word is
  // the floor.
  const shortLabel = locale === 'zh-TW' ? 'AI翻譯' : 'Translate'
  const activeLabel = locale === 'zh-TW' ? '收合翻譯解讀' : 'Hide translation'
  const className_ = cn(
    // A real, self-evident button — visible border + tinted fill + primary
    // label even at rest (the old ghost styling read as a text link). Still
    // compact so a list of many reports doesn't get loud.
    'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium shadow-sm transition-colors cursor-pointer',
    active
      ? 'border-primary bg-primary/15 text-primary'
      : 'border-primary/40 bg-primary/5 text-primary hover:border-primary hover:bg-primary/10',
    className,
  )
  const inner = (
    <>
      <Languages className="h-3.5 w-3.5" />
      {/* Full label on tablet/desktop; short label on phones — never icon-only. */}
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{shortLabel}</span>
    </>
  )
  if (asDiv) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        // stop the parent header-button (accordion trigger) from also toggling.
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            e.stopPropagation()
            onToggle(e as unknown as React.MouseEvent)
          }
        }}
        title={active ? activeLabel : label}
        aria-label={active ? activeLabel : label}
        aria-pressed={active}
        className={className_}
      >
        {inner}
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      title={active ? activeLabel : label}
      aria-label={active ? activeLabel : label}
      aria-pressed={active}
      className={className_}
    >
      {inner}
    </button>
  )
}
