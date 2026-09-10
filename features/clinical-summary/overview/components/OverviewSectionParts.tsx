"use client"

// Small pieces every overview section shares: the header's "open the owning
// tab" button, the truncation line the bounded 2×2 layout shows, and the empty
// state. All navigation goes through the existing resource-navigation store —
// the same channel a cited source in the AI summary uses — so the left panel
// switches tabs and scroll-flashes the record with no new plumbing.
import { Maximize2 } from 'lucide-react'
import { useCallback, type ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useResourceNavigationStore } from '@/src/application/stores/resource-navigation.store'
import { cn } from '@/src/shared/utils/cn.utils'
import {
  OVERVIEW_EMPTY_CLASS,
  OVERVIEW_ICON_ACTION_CLASS,
  OVERVIEW_TRUNCATION_CLASS,
} from './overview-styles'

export interface OverviewNavigationTarget {
  resourceType: string
  resourceId?: string
  /** Tab name shown in the button title and the "see all" link. */
  tabLabel: string
  /** Destination INSIDE the 報告 tab. 檢驗 sends the clinician to the
   *  cumulative report (the panel that actually holds every analyte over
   *  time), not the flat 全部 list, which shows one row per report. The
   *  reports card only honours this when the category id is a real cumulative
   *  panel, so it travels with the row's own category. */
  reportView?: 'cumulative'
  cumulativeCategoryId?: string
  /** Preferred reports sub-tab ('imaging', 'pathology', …) so 影像／檢查報告
   *  opens its own list rather than the flat 全部 index. */
  reportTab?: string
  /** Overrides the default 「在{tab}分頁看全部」 wording. */
  seeAllLabel?: string
}

export function useOverviewNavigate() {
  const navigate = useResourceNavigationStore((state) => state.navigate)
  return useCallback(
    (target: OverviewNavigationTarget) => {
      if (!target.resourceId) return
      // A cumulative request without a valid panel id is never claimed by the
      // reports card, which would leave the user on an unchanged screen. Fall
      // back to the plain resource jump instead.
      const cumulative = target.reportView === 'cumulative' && !!target.cumulativeCategoryId
      navigate({
        resourceType: target.resourceType,
        resourceId: target.resourceId,
        ...(cumulative
          ? { reportView: 'cumulative' as const, cumulativeCategoryId: target.cumulativeCategoryId }
          : {}),
        ...(target.reportTab ? { reportTab: target.reportTab } : {}),
      })
    },
    [navigate],
  )
}

/**
 * Opens the card's CURRENT list at full length.
 *
 * Not a route to the owning tab — the footer link is that, in words. This is
 * the same rows the card is already showing, minus the height limit: a card
 * that fits seven of ten current medications can show all ten without the
 * reader leaving 總覽. Anything richer (a timeline, search, trends, the full
 * prescription history) is what the tab is for, and duplicating it here would
 * only produce a worse copy that drifts.
 */
export function OverviewExpandButton({
  label,
  onClick,
  disabled = false,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  if (disabled) return null
  return (
    <button
      type="button"
      className={OVERVIEW_ICON_ACTION_CLASS}
      title={label}
      aria-label={label}
      aria-haspopup="dialog"
      onClick={onClick}
    >
      <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  )
}

/** The full-length list itself. Scrolls; the card behind it does not move. */
export function OverviewFullListDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  filters,
  children,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  title: string
  subtitle?: string
  /** The card's own filter controls, driving the same state — changing the
   *  filter here re-renders this list rather than making the reader close the
   *  dialog, change it on the card, and open it again. */
  filters?: ReactNode
  children: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-baseline gap-2 text-base">
            <span>{title}</span>
            {subtitle && (
              <span className="text-xs font-normal text-muted-foreground">{subtitle}</span>
            )}
          </DialogTitle>
          {filters && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">{filters}</div>
          )}
        </DialogHeader>
        <div className="max-h-[68vh] min-w-0 overflow-y-auto">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** 「另 N 項 · 在○○分頁看全部 →」. Pinned to the bottom of a bounded card. */
export function OverviewTruncationNote({
  hiddenCount,
  target,
  always = false,
  className,
}: {
  hiddenCount: number
  target: OverviewNavigationTarget
  /** Show the link even when nothing was truncated. */
  always?: boolean
  className?: string
}) {
  const { t } = useLanguage()
  const navigateTo = useOverviewNavigate()
  // `always`: the route out stays offered even when nothing was cut — 檢驗's
  // 常用 view is a deliberate short list, so "nothing hidden by the fit" does
  // not mean "you are seeing everything".
  if (hiddenCount <= 0 && !always) return null
  return (
    <div className={cn(OVERVIEW_TRUNCATION_CLASS, className)}>
      {hiddenCount > 0 && (
        <span>{t.overview.moreItems.replace('{count}', String(hiddenCount))}</span>
      )}
      <button
        type="button"
        className="cursor-pointer text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        onClick={() => navigateTo(target)}
      >
        {target.seeAllLabel ?? t.overview.seeAllIn.replace('{tab}', target.tabLabel)}
      </button>
    </div>
  )
}

export function OverviewEmptyRow() {
  const { t } = useLanguage()
  return <div className={OVERVIEW_EMPTY_CLASS}>{t.overview.empty}</div>
}
