import { startTransition, useEffect, useState } from 'react'
import {
  calculateReportTabCounts,
  type ReportTabCounts,
} from '../utils/report-tab-counts'

/**
 * Deferred lightweight Reports tab counts.
 *
 * The count projection is intentionally kept out of the render path: even a
 * "lightweight" full-resource scan is visible as input latency when Reports is
 * mounted from another clinical tab. Labels render first and receive counts in
 * an idle callback after the browser has had a chance to paint.
 */
export function useReportTabCounts(
  diagnosticReports: any[] = [],
  imagingStudies: any[] = [],
  observations: any[] = [],
  procedures: any[] = [],
  enabled = true,
): ReportTabCounts | null {
  const [snapshot, setSnapshot] = useState<{
    diagnosticReports: any[]
    imagingStudies: any[]
    observations: any[]
    procedures: any[]
    counts: ReportTabCounts
  } | null>(null)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    let timer: number | undefined
    let idleId: number | undefined
    const browserWindow = window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions,
      ) => number
      cancelIdleCallback?: (handle: number) => void
    }
    const calculate = () => {
      if (cancelled) return
      const nextCounts = calculateReportTabCounts(
        diagnosticReports,
        imagingStudies,
        observations,
        procedures,
      )
      if (cancelled) return
      startTransition(() => setSnapshot({
        diagnosticReports,
        imagingStudies,
        observations,
        procedures,
        counts: nextCounts,
      }))
    }
    const frame = window.requestAnimationFrame(() => {
      if (browserWindow.requestIdleCallback) {
        idleId = browserWindow.requestIdleCallback(calculate, { timeout: 600 })
      } else {
        timer = window.setTimeout(calculate, 80)
      }
    })

    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
      if (timer !== undefined) window.clearTimeout(timer)
      if (idleId !== undefined) browserWindow.cancelIdleCallback?.(idleId)
    }
  }, [diagnosticReports, enabled, imagingStudies, observations, procedures])

  const snapshotMatchesSources = snapshot
    && snapshot.diagnosticReports === diagnosticReports
    && snapshot.imagingStudies === imagingStudies
    && snapshot.observations === observations
    && snapshot.procedures === procedures
  return enabled && snapshotMatchesSources ? snapshot.counts : null
}
