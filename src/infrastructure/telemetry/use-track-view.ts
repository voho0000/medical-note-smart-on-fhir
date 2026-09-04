// `view_open` observer.
//
// Deliberately an effect on the layer's active state rather than a click
// handler: every layer has a default page (left `patient`, right
// `medical-chat`, reports `cumulative`, meds `list`, summary `standard`), and
// counting only clicks would systematically under-report those defaults. The
// mount fire is the point.
//
// `trigger` says how the state got there — see `markUserTrigger` in
// usage-analytics.ts.
'use client'

import { useEffect } from 'react'
import { consumeTrigger, trackEvent, type AnalyticsArea } from './usage-analytics'

/**
 * @param active False while this layer is mounted but not on screen. Several
 *   hosts are sticky-mounted (the left panel keeps visited clinical tabs
 *   mounted, the right panel keeps visited features mounted), so without this
 *   the inner layer would report exactly once per session while its parent tab
 *   reports every visit — and the ratio between them is the whole point.
 *   Re-exposure fires again with `auto`: returning to 報告 is a click on the
 *   LEFT tab, so `left/reports` carries the `user` trigger and the re-shown
 *   `reports/<sub-tab>` is a consequence of it, not a choice of its own.
 */
export function useTrackView(
  area: AnalyticsArea,
  id: string | null | undefined,
  active: boolean = true,
): void {
  useEffect(() => {
    if (!active) return
    // A layer whose selection is not resolved yet (e.g. the cumulative
    // category before the table reports its effective default) has no view.
    if (typeof id !== 'string' || id.length === 0) return
    trackEvent('view_open', { area, id, trigger: consumeTrigger(area) })
  }, [area, id, active])
}
