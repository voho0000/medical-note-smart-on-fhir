"use client"

import { useEffect } from "react"

/**
 * Publish the *visual* viewport (the part not covered by the on-screen
 * keyboard) as CSS variables on <html>:
 *
 * - `--app-viewport-height` — height the app shell should occupy.
 * - `--keyboard-inset` — how much the keyboard currently overlaps the layout
 *   viewport, for fixed overlays that must lift their own controls.
 *
 * The viewport meta declares `interactive-widget=resizes-content`, which fixes
 * this on Chrome/Android by shrinking the layout viewport. iOS Safari ignores
 * it and overlays the keyboard instead, leaving a `h-svh` shell with its
 * composer underneath — so we measure `visualViewport` and drive the height
 * ourselves. Falls back silently to the CSS defaults when the API is absent.
 */
export function useVisualViewport(): void {
  useEffect(() => {
    const viewport = typeof window === "undefined" ? undefined : window.visualViewport
    const root = document.documentElement
    if (!viewport) return

    const apply = () => {
      root.style.setProperty("--app-viewport-height", `${viewport.height}px`)
      // offsetTop is non-zero when the page itself is scrolled under the
      // keyboard; both terms are needed or the inset is wrong mid-scroll.
      const overlap = window.innerHeight - viewport.height - viewport.offsetTop
      root.style.setProperty("--keyboard-inset", `${Math.max(0, Math.round(overlap))}px`)
    }

    apply()
    viewport.addEventListener("resize", apply)
    viewport.addEventListener("scroll", apply)
    return () => {
      viewport.removeEventListener("resize", apply)
      viewport.removeEventListener("scroll", apply)
      root.style.removeProperty("--app-viewport-height")
      root.style.removeProperty("--keyboard-inset")
    }
  }, [])
}
