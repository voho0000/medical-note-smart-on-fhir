"use client"

import { useCallback, useEffect, useLayoutEffect, useRef } from "react"

/**
 * Keep each tab's scroll position across right-panel tab switches.
 *
 * `scrollMode: 'panel'` features (醫療摘要) scroll the whole right panel rather
 * than an inner ScrollArea. Switching to 臨床對話 hides the summary, which
 * collapses the panel's scrollHeight — and the browser immediately clamps
 * scrollTop to 0. Coming back therefore dropped a clinician at the top of a
 * long summary they were halfway through.
 *
 * Same lesson as the right-detail restore in app/page.tsx: by the time any
 * effect could read the position it is already gone, so sample it CONTINUOUSLY
 * while the tab is visible. `onValueChange` additionally captures the exact
 * value while the old content is still laid out; the scroll listener covers the
 * switches that bypass it (guided tour, header navigation).
 *
 * A tab whose feature owns its own ScrollArea simply records ~0 here, which is
 * what restoring it does anyway — no special-casing needed.
 */
export function usePanelScrollMemory(activeTab: string) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const positionsRef = useRef<Record<string, number>>({})
  const activeTabRef = useRef(activeTab)
  // True while we are re-applying a position, so the scroll events our own
  // writes generate cannot overwrite what we are restoring.
  const restoringRef = useRef(false)

  const getScrollHost = useCallback((): HTMLElement | null => {
    let parent = hostRef.current?.parentElement ?? null
    while (parent) {
      const overflowY = window.getComputedStyle(parent).overflowY
      if (/(auto|scroll|overlay)/.test(overflowY)) return parent
      parent = parent.parentElement
    }
    return null
  }, [])

  /** Capture before React swaps the tab, while the old content still exists. */
  const captureBeforeSwitch = useCallback(() => {
    const host = getScrollHost()
    if (host) positionsRef.current[activeTabRef.current] = host.scrollTop
  }, [getScrollHost])

  useEffect(() => {
    const host = getScrollHost()
    if (!host) return
    const onScroll = () => {
      if (restoringRef.current) return
      // A collapsed (hidden) panel reports 0. Recording that would erase the
      // position we are about to restore.
      if (host.scrollHeight <= host.clientHeight + 1) return
      positionsRef.current[activeTabRef.current] = host.scrollTop
    }
    host.addEventListener('scroll', onScroll, { passive: true })
    return () => host.removeEventListener('scroll', onScroll)
  }, [getScrollHost])

  useLayoutEffect(() => {
    if (activeTabRef.current === activeTab) return
    activeTabRef.current = activeTab
    const host = getScrollHost()
    if (!host) return
    const target = positionsRef.current[activeTab] ?? 0
    if (target <= 0) {
      host.scrollTop = 0
      return
    }
    // The panel's cards re-lay out over the next few frames (several mount
    // deferred), so a single assignment lands while the panel is still short
    // and gets clamped back. Re-apply until it sticks, with a hard frame
    // budget so this can never spin.
    restoringRef.current = true
    let framesLeft = 30
    let frame = 0
    const restore = () => {
      host.scrollTop = target
      framesLeft -= 1
      if (Math.abs(host.scrollTop - target) > 1 && framesLeft > 0) {
        frame = requestAnimationFrame(restore)
        return
      }
      restoringRef.current = false
    }
    restore()
    return () => {
      cancelAnimationFrame(frame)
      restoringRef.current = false
    }
  }, [activeTab, getScrollHost])

  return { hostRef, captureBeforeSwitch }
}
