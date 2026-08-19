// A shared current-time snapshot for day-granularity clinical calculations.
//
// Medication "days remaining" and active/recent windows need to advance when
// the local calendar day changes. They do not need a new millisecond timestamp
// every time Chrome restores focus. The previous per-hook focus listeners did
// exactly that: each mounted AI/UI consumer updated independently on both
// `focus` and `visibilitychange`, rebuilding large medication and encounter
// projections before the clinician's first tab click could paint.
//
// This external store has one browser listener set for the entire application.
// Same-day resume events are no-ops; a real day rollover publishes one shared
// snapshot to every consumer, preserving clinical freshness without a resume
// render storm.
'use client'

import { useSyncExternalStore } from 'react'

type Listener = () => void

const listeners = new Set<Listener>()

let currentNowMs: number | undefined
let currentDayKey: string | undefined
let midnightTimer: ReturnType<typeof setTimeout> | undefined
let browserListenersAttached = false

function localDayKey(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function getSharedNow(): number {
  if (currentNowMs === undefined) {
    currentNowMs = Date.now()
    currentDayKey = localDayKey(currentNowMs)
  }
  return currentNowMs
}

function msUntilNextMidnight(timestamp: number): number {
  const next = new Date(timestamp)
  next.setHours(24, 0, 0, 0)
  return Math.max(0, next.getTime() - timestamp)
}

function scheduleMidnightRefresh() {
  if (midnightTimer !== undefined) clearTimeout(midnightTimer)
  const now = Date.now()
  midnightTimer = setTimeout(() => {
    refreshIfCalendarDayChanged()
    scheduleMidnightRefresh()
  }, msUntilNextMidnight(now) + 1000)
}

function refreshIfCalendarDayChanged() {
  const nextNowMs = Date.now()
  const nextDayKey = localDayKey(nextNowMs)
  getSharedNow()
  if (nextDayKey === currentDayKey) return false

  currentNowMs = nextNowMs
  currentDayKey = nextDayKey
  listeners.forEach((listener) => listener())
  return true
}

function onWindowFocus() {
  if (refreshIfCalendarDayChanged()) scheduleMidnightRefresh()
}

function onVisibilityChange() {
  if (document.visibilityState !== 'visible') return
  if (refreshIfCalendarDayChanged()) scheduleMidnightRefresh()
}

function attachBrowserListeners() {
  if (browserListenersAttached || typeof window === 'undefined') return
  browserListenersAttached = true
  window.addEventListener('focus', onWindowFocus)
  document.addEventListener('visibilitychange', onVisibilityChange)
  scheduleMidnightRefresh()
}

function detachBrowserListeners() {
  if (!browserListenersAttached || typeof window === 'undefined') return
  browserListenersAttached = false
  window.removeEventListener('focus', onWindowFocus)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  if (midnightTimer !== undefined) {
    clearTimeout(midnightTimer)
    midnightTimer = undefined
  }
  // No mounted consumer can observe this value. Re-initialize on the next
  // subscription so remounting after a real day change starts fresh.
  currentNowMs = undefined
  currentDayKey = undefined
}

function subscribe(listener: Listener) {
  listeners.add(listener)
  attachBrowserListeners()
  // Covers a component mounting after the page was suspended across midnight.
  refreshIfCalendarDayChanged()

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) detachBrowserListeners()
  }
}

/**
 * Stable within one local calendar day. All mounted consumers share the same
 * snapshot and the same focus/visibility listeners.
 */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSharedNow, getSharedNow)
}
