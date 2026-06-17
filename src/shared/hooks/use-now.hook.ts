// A current-time value that refreshes on real-world events instead of being
// frozen at mount.
//
// Anything that derives "days remaining" / active-vs-inactive from the wall
// clock (e.g. medication supply countdowns) used to capture `Date.now()` once
// inside a useMemo and never recompute — so a tab left open across a day
// boundary would keep showing yesterday's number. Depending on this hook in
// that memo makes it re-run when:
//   - the tab regains focus / becomes visible (you came back to it), and
//   - the next local midnight ticks over (you left it open AND visible).
//
// It deliberately does NOT poll on a per-second timer — day-granularity values
// only need to move at those two moments. The returned value is the live
// instant (ms since epoch), so callers keep their existing
// `ceil((end - now) / day)` math unchanged; only the freshness improves.
'use client'

import { useEffect, useState } from 'react'

function msUntilNextMidnight(): number {
  const next = new Date()
  next.setHours(24, 0, 0, 0)
  return next.getTime() - Date.now()
}

export function useNow(): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const update = () => setNow(Date.now())

    const onVisibility = () => {
      if (document.visibilityState === 'visible') update()
    }

    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', onVisibility)

    // Re-armed on each `now` change (incl. after this very fire), so a tab that
    // stays open and visible past midnight still rolls over. +1s guards against
    // firing a hair before the boundary due to timer rounding.
    const midnightTimer = setTimeout(update, msUntilNextMidnight() + 1000)

    return () => {
      window.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', onVisibility)
      clearTimeout(midnightTimer)
    }
  }, [now])

  return now
}
