// The 「AI翻譯」toggle that sits in a report's header action area. Low-key
// ghost styling (colours only on hover / when active) so that a patient with
// dozens of reports doesn't see a wall of loud buttons — the button is discreet
// until reached for. Purely presentational: the host owns the open/closed state
// and renders <ReportInterpretationPanel> below the report body when active.
'use client'

import { Languages, Loader2 } from 'lucide-react'
import { cn } from '@/src/shared/utils/cn.utils'
import { useLanguage } from '@/src/application/providers/language.provider'

interface ReportInterpretationButtonProps {
  active: boolean
  onToggle: (e: React.MouseEvent) => void
  className?: string
  dataTour?: string
  /** Right-detail source opened by this action. Used to preserve the source
   *  row and scroll position when a phone temporarily switches panels. */
  detailSourceId?: string
  /** Keeps the compact action in place while generation runs in the background. */
  busy?: boolean
  /** Render as a div[role=button] instead of a <button>. Needed when the host
   *  header is itself a <button> (e.g. a Radix AccordionTrigger on a panel
   *  report) — a nested <button> is invalid HTML. Defaults to a real <button>. */
  asDiv?: boolean
}

export function ReportInterpretationButton({
  active,
  onToggle,
  className,
  dataTour,
  detailSourceId,
  busy = false,
  asDiv,
}: ReportInterpretationButtonProps) {
  const { locale } = useLanguage()
  const label = busy
    ? locale === 'zh-TW' ? '翻譯中' : 'Translating'
    : locale === 'zh-TW' ? 'AI翻譯' : 'Translate'
  const activeLabel = locale === 'zh-TW' ? '收合翻譯解讀' : 'Hide translation'
  const accessibleLabel = busy ? label : active ? activeLabel : label
  const className_ = cn(
    // A real, self-evident button — visible border + tinted fill + primary
    // label even at rest (the old ghost styling read as a text link). Still
    // compact so a list of many reports doesn't get loud.
    'inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 text-xs font-medium transition-colors cursor-pointer',
    active || busy
      ? 'border-primary bg-primary/15 text-primary'
      : 'border-primary/40 bg-primary/5 text-primary hover:border-primary hover:bg-primary/10',
    busy && 'cursor-wait opacity-75',
    className,
  )
  const inner = (
    <>
      {busy
        ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
        : <Languages className="h-3 w-3 shrink-0" aria-hidden />}
      <span>{label}</span>
    </>
  )
  if (asDiv) {
    return (
      <div
        role="button"
        data-tour={dataTour}
        data-detail-source-id={detailSourceId}
        tabIndex={0}
        onClick={busy ? (e) => e.stopPropagation() : onToggle}
        // stop the parent header-button (accordion trigger) from also toggling.
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (busy) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            e.stopPropagation()
            onToggle(e as unknown as React.MouseEvent)
          }
        }}
        title={accessibleLabel}
        aria-label={accessibleLabel}
        aria-busy={busy}
        aria-disabled={busy}
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
      data-tour={dataTour}
      data-detail-source-id={detailSourceId}
      disabled={busy}
      onClick={onToggle}
      title={accessibleLabel}
      aria-label={accessibleLabel}
      aria-busy={busy}
      aria-pressed={active}
      className={className_}
    >
      {inner}
    </button>
  )
}
