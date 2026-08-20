"use client"

import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { TapTooltip } from "@/src/shared/components/TapTooltip"
import { cn } from "@/src/shared/utils/cn.utils"

type CompactLabResultRowProps = {
  title: string
  titleNode?: ReactNode
  value: string
  abnormal?: boolean
  referenceText?: string
  rangeUnassessed?: boolean
  rangeUnassessedLabel?: string
  rangeUnassessedTooltip?: string
  leadingTitleContent?: ReactNode
  titleActions?: ReactNode
  afterValue?: ReactNode
  trailingContent?: ReactNode
  className?: string
  titleColumnClassName?: string
  titleClassName?: string
  valueMaxWidthClassName?: string
  role?: "button"
  tabIndex?: number
  ariaExpanded?: boolean
  onClick?: (event: MouseEvent<HTMLDivElement>) => void
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void
}

function normalizeComparableText(text: string): string {
  return text.replace(/[[\]]/g, "").replace(/\s+/g, " ").trim()
}

function shouldShowReferenceRange(value: string, referenceText?: string): boolean {
  if (!referenceText) return false
  return normalizeComparableText(referenceText) !== normalizeComparableText(value)
}

function CompactValue({
  value,
  abnormal,
  maxWidthClassName = "max-w-[9rem]",
}: {
  value: string
  abnormal: boolean
  maxWidthClassName?: string
}) {
  // A truncated result value is the row's whole point, and on touch the hover
  // bubble that held the rest of it was unreachable. Tapping the value drops
  // the truncation so it wraps in place — no bubble to position, nothing to
  // dismiss, and the reading stays selectable/copyable. Desktop keeps the
  // quick hover peek while collapsed.
  const [expanded, setExpanded] = useState(false)
  const isLong = value.length > 20
  const valueClass = cn(
    "text-[0.8125rem] font-bold tabular-nums",
    isLong ? ["shrink truncate", maxWidthClassName] : "shrink-0",
    abnormal ? "text-clinical-abnormal" : "text-foreground",
  )

  if (!isLong) return <span className={valueClass}>{value}</span>

  const toggle = (event: MouseEvent | KeyboardEvent) => {
    // The row itself is often a toggle — revealing the value must not also
    // open/close it.
    event.stopPropagation()
    setExpanded((current) => !current)
  }

  if (expanded) {
    return (
      <span
        role="button"
        tabIndex={0}
        aria-expanded
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return
          event.preventDefault()
          toggle(event)
        }}
        className={cn(
          "min-w-0 shrink cursor-pointer touch-manipulation whitespace-normal break-words text-[0.8125rem] font-bold tabular-nums",
          abnormal ? "text-clinical-abnormal" : "text-foreground",
        )}
      >
        {value}
      </span>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          aria-expanded={false}
          onClick={toggle}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return
            event.preventDefault()
            toggle(event)
          }}
          className={cn(valueClass, "cursor-pointer touch-manipulation")}
        >
          {value}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[min(90vw,24rem)] whitespace-normal break-words text-xs leading-relaxed">
        {value}
      </TooltipContent>
    </Tooltip>
  )
}

function CompactReferenceRange({
  referenceText,
  value,
}: {
  referenceText?: string
  value: string
}) {
  if (!referenceText || !shouldShowReferenceRange(value, referenceText)) return null

  // Most ranges are short clinical values such as "[3.5–5.1 mmol/L]" and
  // should be readable without another tap. Only complex stratified ranges
  // collapse to a tappable/hoverable label.
  if (referenceText.length <= 22) {
    return (
      <span
        data-testid="reference-range-inline"
        className="shrink-0 whitespace-nowrap text-[0.6875rem] text-muted-foreground"
      >
        {referenceText}
      </span>
    )
  }

  return (
    <TapTooltip
      content={referenceText}
      aria-label={`參考範圍 ${referenceText}`}
      contentClassName="max-h-[50vh] max-w-[min(90vw,28rem)] overflow-y-auto whitespace-normal break-words text-xs leading-relaxed"
      className="inline-flex min-w-0 max-w-[8rem] shrink sm:max-w-[12rem]"
    >
      <span
        data-testid="reference-range-truncated"
        className="min-w-0 truncate text-[0.6875rem] text-muted-foreground"
      >
        {referenceText}
      </span>
    </TapTooltip>
  )
}

function RangeUnassessedBadge({
  label = "未判讀",
  tooltip = "此項沒有來源異常標示，參考範圍也太複雜或資料不一致，未自動判讀是否異常。",
}: {
  label?: string
  tooltip?: string
}) {
  // 「未判讀」 says nothing on its own — WHY the app did not assess this value
  // lives only in the bubble, and a clinician reading on an iPad could never
  // open it. Tap now reveals the same explanation.
  return (
    <TapTooltip
      content={tooltip}
      aria-label={label}
      contentClassName="max-w-[min(90vw,22rem)] whitespace-normal text-xs leading-relaxed"
      className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0 text-[0.625rem] font-medium text-slate-600 dark:border-border dark:bg-muted/40 dark:text-muted-foreground"
    >
      {label}
    </TapTooltip>
  )
}

export function CompactLabResultRow({
  title,
  titleNode,
  value,
  abnormal = false,
  referenceText,
  rangeUnassessed = false,
  rangeUnassessedLabel,
  rangeUnassessedTooltip,
  leadingTitleContent,
  titleActions,
  afterValue,
  trailingContent,
  className,
  titleColumnClassName,
  titleClassName,
  valueMaxWidthClassName,
  role,
  tabIndex,
  ariaExpanded,
  onClick,
  onKeyDown,
}: CompactLabResultRowProps) {
  return (
    <div
      role={role}
      tabIndex={tabIndex}
      aria-expanded={ariaExpanded}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={cn(
        "grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1.5 gap-y-0.5 overflow-hidden rounded-md border bg-muted/40 px-2 py-1 sm:flex sm:px-2.5 sm:py-1.5",
        abnormal && "border-red-200 bg-red-50/30 dark:border-rose-500/25 dark:bg-rose-500/[0.06]",
        className,
      )}
    >
      <div className={cn(
        "flex min-w-0 basis-[45%] shrink-0 grow-0 items-center gap-1.5",
        titleColumnClassName,
      )}>
        {leadingTitleContent}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn("truncate text-[0.8125rem] font-semibold text-foreground", titleClassName)}>
              {titleNode ?? title}
            </span>
          </TooltipTrigger>
          <TooltipContent>{title}</TooltipContent>
        </Tooltip>
        {titleActions}
      </div>
      <div className="flex min-w-0 items-center justify-end gap-1.5 sm:flex-1 sm:justify-start">
        <CompactValue value={value} abnormal={abnormal} maxWidthClassName={valueMaxWidthClassName} />
        {afterValue}
        <CompactReferenceRange referenceText={referenceText} value={value} />
        {rangeUnassessed && (
          <RangeUnassessedBadge
            label={rangeUnassessedLabel}
            tooltip={rangeUnassessedTooltip}
          />
        )}
      </div>
      {trailingContent && (
        <div className="col-span-2 row-start-2 flex min-w-0 items-center justify-start overflow-hidden sm:col-auto sm:row-auto sm:shrink-0">
          {trailingContent}
        </div>
      )}
    </div>
  )
}
