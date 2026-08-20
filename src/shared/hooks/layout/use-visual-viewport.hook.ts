"use client"

import { useEffect } from "react"

/**
 * Publish the *visual* viewport (the part not covered by the on-screen
 * keyboard) as CSS variables on <html>:
 *
 * - `--app-viewport-height` — height the app shell should occupy.
 * - `--app-viewport-offset-top` — the visual viewport's top edge relative to
 *   the layout viewport. iOS Safari pans this edge when it reveals an input.
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

    let frame = 0
    let stableViewportHeight = viewport.height

    const apply = () => {
      frame = 0
      // A pinch zoom also shrinks visualViewport. Reflowing the whole app in
      // that case makes zoom unusable, so only follow it at the normal scale.
      const isPinchZoomed = Math.abs(viewport.scale - 1) > 0.01
      const viewportHeight = isPinchZoomed ? window.innerHeight : viewport.height
      const viewportOffsetTop = isPinchZoomed ? 0 : Math.max(0, viewport.offsetTop)

      root.style.setProperty("--app-viewport-height", `${Math.round(viewportHeight)}px`)
      root.style.setProperty(
        "--app-viewport-offset-top",
        `${Math.round(viewportOffsetTop)}px`,
      )
      // offsetTop is non-zero when the page itself is scrolled under the
      // keyboard; both terms are needed or the inset is wrong mid-scroll.
      const overlap = isPinchZoomed
        ? 0
        : window.innerHeight - viewport.height - viewportOffsetTop
      root.style.setProperty("--keyboard-inset", `${Math.max(0, Math.round(overlap))}px`)

      const activeElement = document.activeElement
      const hasFocusedEditor = activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        (activeElement instanceof HTMLElement && activeElement.isContentEditable)
      const viewportContracted = stableViewportHeight - viewport.height > 120
      const keyboardOpen = !isPinchZoomed && (
        overlap > 80 || (hasFocusedEditor && viewportContracted)
      )
      root.dataset.keyboardOpen = keyboardOpen ? "true" : "false"

      // Android shrinks both innerHeight and visualViewport, so overlap is 0.
      // Keep the last unfocused height as its keyboard-free baseline.
      if (!hasFocusedEditor && overlap <= 80 && !isPinchZoomed) {
        stableViewportHeight = viewport.height
      } else {
        stableViewportHeight = Math.max(stableViewportHeight, viewport.height)
      }
    }

    const scheduleApply = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(apply)
    }

    apply()
    viewport.addEventListener("resize", scheduleApply)
    viewport.addEventListener("scroll", scheduleApply)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      viewport.removeEventListener("resize", scheduleApply)
      viewport.removeEventListener("scroll", scheduleApply)
      root.style.removeProperty("--app-viewport-height")
      root.style.removeProperty("--app-viewport-offset-top")
      root.style.removeProperty("--keyboard-inset")
      delete root.dataset.keyboardOpen
    }
  }, [])
}
