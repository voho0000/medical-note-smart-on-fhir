"use client"

// 「調整順序」 — the one place a clinician can see and reorder every cumulative
// category at once. The per-section ↑ ↓ buttons cover "move this one"; this
// panel covers "put my three panels on top".
//
// Arrow buttons, no drag-and-drop: the repo carries no dnd library, and a
// hand-rolled pointer drag would be the least accessible control in the
// workspace (the reorder buttons are keyboard- and screen-reader-usable as-is).
import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { cn } from "@/src/shared/utils/cn.utils"

export interface CumulativeOrderEntry {
  id: string
  label: string
  /** Collection dates available for this category — 0 renders 「無資料」. */
  dateCount: number
}

export function CumulativeOrderPanel({
  entries,
  onMove,
  onReset,
  canReset,
}: {
  entries: CumulativeOrderEntry[]
  onMove: (id: string, direction: -1 | 1) => void
  onReset: () => void
  canReset: boolean
}) {
  const { t } = useLanguage()
  const strings = (t.reports as any).cumulativeStacked ?? {}
  const dateCountTemplate: string = strings.dateCount ?? '{count} 個日期'
  const moveUpTemplate: string = strings.moveUp ?? '{label} 往上移'
  const moveDownTemplate: string = strings.moveDown ?? '{label} 往下移'
  const fill = (template: string, label: string) => template.replace('{label}', label)

  return (
    <div className="w-[15rem] max-w-[calc(100vw-2rem)]">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">
          {strings.orderPanelTitle ?? '分類順序'}
        </span>
        <button
          type="button"
          onClick={onReset}
          disabled={!canReset}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.6875rem] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-40 max-md:min-h-[36px]"
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          {strings.resetOrder ?? '恢復預設'}
        </button>
      </div>
      <p className="mb-1.5 text-[0.625rem] leading-tight text-muted-foreground">
        {strings.orderPanelHint ?? '用箭頭調整；順序會記在這台裝置，直式與分頁版面共用。'}
      </p>
      <ul className="flex flex-col gap-px">
        {entries.map((entry, index) => (
          <li
            key={entry.id}
            className="flex min-h-[28px] items-center gap-1.5 rounded px-1 max-md:min-h-[36px]"
          >
            <span className="w-3.5 shrink-0 text-right text-[0.625rem] tabular-nums text-muted-foreground">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
              {entry.label}
              <span className="ml-1 text-[0.625rem] font-normal text-muted-foreground">
                {entry.dateCount === 0
                  ? (strings.noDates ?? '無資料')
                  : dateCountTemplate.replace('{count}', String(entry.dateCount))}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-0.5">
              <OrderArrowButton
                label={fill(moveUpTemplate, entry.label)}
                disabled={index === 0}
                onClick={() => onMove(entry.id, -1)}
                direction="up"
              />
              <OrderArrowButton
                label={fill(moveDownTemplate, entry.label)}
                disabled={index === entries.length - 1}
                onClick={() => onMove(entry.id, 1)}
                direction="down"
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function OrderArrowButton({
  label,
  disabled,
  onClick,
  direction,
  compact = false,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  direction: 'up' | 'down'
  compact?: boolean
}) {
  const Icon = direction === 'up' ? ArrowUp : ArrowDown
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded border border-border bg-card text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-35",
        compact
          ? "h-[18px] w-[18px] max-md:h-9 max-md:w-9"
          : "h-[22px] w-[22px] max-md:h-9 max-md:w-9",
      )}
    >
      <Icon className="h-2.5 w-2.5" aria-hidden="true" />
    </button>
  )
}

/** Per-section ↑ ↓ pair shown in a stacked section header. */
export function CumulativeSectionOrderControls({
  label,
  isFirst,
  isLast,
  onMove,
}: {
  label: string
  isFirst: boolean
  isLast: boolean
  onMove: (direction: -1 | 1) => void
}) {
  const { t } = useLanguage()
  const strings = (t.reports as any).cumulativeStacked ?? {}
  const fill = (template: string) => template.replace('{label}', label)
  return (
    <div
      role="group"
      aria-label={fill(strings.sectionOrderLabel ?? '{label} 順序')}
      className="inline-flex shrink-0 items-center gap-0.5"
    >
      <OrderArrowButton
        compact
        direction="up"
        disabled={isFirst}
        label={fill(strings.moveUp ?? '{label} 往上移')}
        onClick={() => onMove(-1)}
      />
      <OrderArrowButton
        compact
        direction="down"
        disabled={isLast}
        label={fill(strings.moveDown ?? '{label} 往下移')}
        onClick={() => onMove(1)}
      />
    </div>
  )
}
