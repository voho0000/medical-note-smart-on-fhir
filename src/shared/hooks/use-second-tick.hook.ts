// A one-second clock, shared by every consumer that needs one.
//
// `useNow` next door is day-granular on purpose — it exists so medication
// windows roll over at midnight without repainting on every focus event. An
// elapsed-time readout needs the opposite: a value that changes every second,
// but only while something is actually being timed.
//
// Same shape as `useNow`, and for the same reason: the snapshot is a cached
// module value rather than a fresh `Date.now()` per render, so React sees a
// stable value between publishes and rendering stays pure. The interval only
// exists while at least one component is subscribed.
'use client'

import { useSyncExternalStore } from 'react'

type Listener = () => void

const listeners = new Set<Listener>()

let currentTickMs = 0
let timer: ReturnType<typeof setInterval> | undefined

function publish(): void {
  currentTickMs = Date.now()
  for (const listener of listeners) listener()
}

function getSnapshot(): number {
  if (currentTickMs === 0) currentTickMs = Date.now()
  return currentTickMs
}

/** The server has no ticking clock; 0 keeps elapsed readings at zero there. */
function getServerSnapshot(): number {
  return 0
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  if (timer === undefined) {
    // Publish once on the first subscriber so a readout that mounts mid-second
    // is not showing a snapshot from whenever the last consumer unmounted.
    publish()
    timer = setInterval(publish, 1000)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

const NO_TICK: () => () => void = () => () => {}

/**
 * Milliseconds, refreshed every second while `active`.
 *
 * Inactive consumers subscribe to nothing, so a page with no timer running
 * holds no interval at all.
 */
export function useSecondTick(active: boolean): number {
  return useSyncExternalStore(
    active ? subscribe : NO_TICK,
    active ? getSnapshot : getServerSnapshot,
    getServerSnapshot,
  )
}

/** Whole seconds between a start timestamp and the current tick. */
export function elapsedSeconds(startedAt: number | null, tickMs: number): number {
  if (!startedAt || !tickMs) return 0
  return Math.max(0, Math.round((tickMs - startedAt) / 1000))
}
