"use client"

import { useSyncExternalStore } from 'react'

/**
 * How the map draws its points: 'grid', boxes two or three to a row, or
 * 'rows', one line per point with its name, state, content and buttons in
 * columns that line up down the whole section (clinician request 2026-09-28:
 * 「DP 改成一行式而不是一格然後一行有兩格…我想看畫面哪個和諧」).
 *
 * A trial switch while the two are compared on screen, kept in this browser
 * only (`localStorage['visit-point-layout'] = 'rows'`); the page draws 'grid'
 * until the choice is made.
 */
export type PointLayout = 'grid' | 'rows'

const KEY = 'visit-point-layout'

function read(): PointLayout {
  try {
    return window.localStorage.getItem(KEY) === 'rows' ? 'rows' : 'grid'
  } catch {
    return 'grid'
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange)
  return () => window.removeEventListener('storage', onChange)
}

export function usePointLayout(): PointLayout {
  return useSyncExternalStore(subscribe, read, () => 'grid')
}
