"use client"

import { useEffect, useState } from "react"

/** The app's single-panel breakpoint — the same 768px every `md:` class and the
 *  two-panel split in app/page.tsx key off. Keep them in sync. */
export const COMPACT_LAYOUT_BREAKPOINT = 768

/**
 * True while the app is in its single-panel (touch) layout.
 *
 * For the handful of decisions CSS cannot make: which ELEMENT owns an
 * interaction. Phone rows hand their tap to the row itself and demote the icon
 * to an affordance, while desktop keeps the standalone button — that is a
 * difference in rendered handlers, not in styling, so a media query alone can't
 * express it.
 *
 * Starts `false` and corrects in an effect (same pattern as
 * `useResponsiveView`): a client-computed initial value would disagree with the
 * server-rendered HTML and trip hydration.
 */
export function useCompactLayout(breakpoint: number = COMPACT_LAYOUT_BREAKPOINT): boolean {
  const [isCompact, setIsCompact] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    // `max-width` in px, not rem: media-query rem is always the 16px initial
    // value, but this must track the same viewport width the `md:` utilities do.
    const query = window.matchMedia(`(max-width: ${breakpoint - 0.02}px)`)
    const sync = () => setIsCompact(query.matches)
    sync()
    query.addEventListener("change", sync)
    return () => query.removeEventListener("change", sync)
  }, [breakpoint])

  return isCompact
}
