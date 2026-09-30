"use client"

import { createContext, type ReactNode } from 'react'

/**
 * What the page around the CDSS lends the pocket-handbook page (`?visit=book`),
 * which draws its own header over the whole window: the disease tabs, so the
 * clinician switches page there as on the prototype.
 */
export interface VisitBookChrome {
  tabs?: ReactNode
}

export const VisitBookChromeContext = createContext<VisitBookChrome | null>(null)

/** Whether this page was opened as the pocket-handbook experiment (`?visit=book`). */
export function isVisitBookMode(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('visit') === 'book'
}
