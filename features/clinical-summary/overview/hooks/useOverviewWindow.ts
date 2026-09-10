"use client"

// Range state for the 總覽 tab. Deliberately NOT persisted: the window is a
// reading stance for the current chart, not a preference — a clinician who
// widened to 6 months for one complex patient should not inherit that on the
// next one.
import { useCallback, useMemo, useState } from 'react'
import { useNow } from '@/src/shared/hooks/use-now.hook'
import {
  DEFAULT_OVERVIEW_RANGE_MONTHS,
  buildOverviewWindow,
  type OverviewRangeMonths,
  type OverviewWindow,
} from '../utils/overview-selectors'

export interface UseOverviewWindowResult {
  months: OverviewRangeMonths
  setMonths: (months: OverviewRangeMonths) => void
  window: OverviewWindow
}

export function useOverviewWindow(): UseOverviewWindowResult {
  const [months, setMonthsState] = useState<OverviewRangeMonths>(DEFAULT_OVERVIEW_RANGE_MONTHS)
  // Re-anchor when the calendar day rolls over on a tab left open overnight.
  const nowMs = useNow()
  const window = useMemo(() => buildOverviewWindow(months, nowMs), [months, nowMs])
  const setMonths = useCallback((next: OverviewRangeMonths) => setMonthsState(next), [])
  return { months, setMonths, window }
}
