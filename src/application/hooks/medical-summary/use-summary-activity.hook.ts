import { useEffect, useRef } from 'react'
import { useSummaryActivityStore } from '@/src/application/stores/summary-activity.store'

/** Announce only a new completed generation from the run's original scope. */
export function useSummaryActivity({ busy, scope, completedAt, failed }: {
  busy: boolean
  scope: string
  completedAt?: number
  failed: boolean
}) {
  const setGenerating = useSummaryActivityStore(state => state.setGenerating)
  const markCompleted = useSummaryActivityStore(state => state.markCompleted)
  const running = useRef(false)
  const baseline = useRef<{ scope: string; completedAt?: number } | null>(null)
  useEffect(() => {
    if (!running.current && busy) baseline.current = { scope, completedAt }
    setGenerating(busy)
    if (running.current && !busy && !failed && completedAt !== undefined &&
        baseline.current?.scope === scope && baseline.current.completedAt !== completedAt) {
      markCompleted()
    }
    running.current = busy
  }, [busy, scope, completedAt, failed, setGenerating, markCompleted])
}
