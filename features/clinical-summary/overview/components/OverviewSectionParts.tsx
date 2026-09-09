"use client"

// Small pieces every overview section shares: the header's "open the owning
// tab" button, the truncation line the bounded 2×2 layout shows, and the empty
// state. All navigation goes through the existing resource-navigation store —
// the same channel a cited source in the AI summary uses — so the left panel
// switches tabs and scroll-flashes the record with no new plumbing.
import { ExternalLink } from 'lucide-react'
import { useCallback } from 'react'
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

export function OverviewOpenTabButton({ target }: { target: OverviewNavigationTarget }) {
  const { t } = useLanguage()
  const navigateTo = useOverviewNavigate()
  if (!target.resourceId) return null
  return (
    <button
      type="button"
      className={OVERVIEW_ICON_ACTION_CLASS}
      title={t.overview.openInTab.replace('{tab}', target.tabLabel)}
      aria-label={t.overview.openInTab.replace('{tab}', target.tabLabel)}
      onClick={() => navigateTo(target)}
    >
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  )
}

/** 「另 N 項 · 在○○分頁看全部 →」. Pinned to the bottom of a bounded card. */
export function OverviewTruncationNote({
  hiddenCount,
  target,
  className,
}: {
  hiddenCount: number
  target: OverviewNavigationTarget
  className?: string
}) {
  const { t } = useLanguage()
  const navigateTo = useOverviewNavigate()
  if (hiddenCount <= 0) return null
  return (
    <div className={cn(OVERVIEW_TRUNCATION_CLASS, className)}>
      <span>{t.overview.moreItems.replace('{count}', String(hiddenCount))}</span>
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
