"use client"

import { createContext, type ReactNode } from 'react'

/**
 * What the page around the CDSS lends the pocket-handbook page (`?visit=book`),
 * which draws its own header over the whole window: the disease tabs, so the
 * clinician switches page there as on the prototype.
 */
export interface VisitBookChrome {
  tabs?: ReactNode
  /**
   * Chosen as 決策地圖 v2 in the layout switch: the page stays inside the
   * CDSS panel, beside the patient's record, under the panel's own disease
   * and layout switches — not over the whole window.
   */
  inline?: boolean
  /** Inline: open the same page over the whole window (owner request 2026-10-01). */
  onExpand?: () => void
  /** Over the whole window, opened from the panel: back to the panel. */
  onCollapse?: () => void
}

export const VisitBookChromeContext = createContext<VisitBookChrome | null>(null)

/** Whether this page was opened as the pocket-handbook experiment (`?visit=book`). */
export function isVisitBookMode(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('visit') === 'book'
}
