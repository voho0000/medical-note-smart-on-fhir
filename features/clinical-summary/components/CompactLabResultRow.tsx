"use client"

import type { KeyboardEvent, MouseEvent, ReactNode } from "react"
import { Info } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
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
  const isLong = value.length > 20
  const valueClass = cn(
    "text-[0.8125rem] font-bold tabular-nums",
    isLong ? ["shrink truncate", maxWidthClassName] : "shrink-0",
    abnormal ? "text-red-600 dark:text-red-400" : "text-foreground",
  )

  if (!isLong) return <span className={valueClass}>{value}</span>

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={valueClass}>{value}</span>
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
  if (!shouldShowReferenceRange(value, referenceText)) return null

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="hidden min-w-0 flex-1 truncate text-[0.75rem] text-muted-foreground md:inline-block">
            {referenceText}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-h-[50vh] max-w-[min(90vw,28rem)] overflow-y-auto whitespace-normal break-words text-xs leading-relaxed">
          {referenceText}
        </TooltipContent>
      </Tooltip>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="參考範圍"
            className="shrink-0 -m-1 p-1 text-muted-foreground/70 hover:text-muted-foreground md:hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <Info className="h-3.5 w-3.5" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="max-w-[min(88vw,22rem)] text-xs leading-relaxed">
          <div className="font-medium text-foreground">參考範圍</div>
          <div className="mt-0.5 whitespace-normal break-words text-muted-foreground">{referenceText}</div>
        </PopoverContent>
      </Popover>
    </>
  )
}

function RangeUnassessedBadge({
  label = "未判讀",
  tooltip = "此項沒有來源異常標示，參考範圍也太複雜或資料不一致，未自動判讀是否異常。",
}: {
  label?: string
  tooltip?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0 cursor-help items-center rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0 text-[0.625rem] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[min(90vw,22rem)] whitespace-normal text-xs leading-relaxed">
        {tooltip}
      </TooltipContent>
    </Tooltip>
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
        "flex items-center gap-x-1.5 rounded-md border bg-muted/40 px-2.5 py-1.5",
        abnormal && "border-red-200 bg-red-50/30 dark:border-red-800/50 dark:bg-red-950/10",
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
      <CompactValue value={value} abnormal={abnormal} maxWidthClassName={valueMaxWidthClassName} />
      {afterValue}
      <CompactReferenceRange referenceText={referenceText} value={value} />
      {rangeUnassessed && (
        <RangeUnassessedBadge
          label={rangeUnassessedLabel}
          tooltip={rangeUnassessedTooltip}
        />
      )}
      {trailingContent}
    </div>
  )
}
