/**
 * Resizable Layout Hook
 * 
 * Manages resizable split panel layout with drag functionality.
 * Reusable across any split-panel layout in the application.
 * 
 * @param initialWidth - Initial width percentage (default: 50)
 * @param minWidth - Minimum width percentage (default: 30)
 * @param maxWidth - Maximum width percentage (default: 70)
 * @param preferLeftContentPx - Widen the initial split, once on mount, to give
 *   the left panel at least this many CSS pixels — but never past `maxWidth`,
 *   and never narrower than `initialWidth`. A display too small to reach it
 *   simply keeps `initialWidth`, so a laptop is not handed a split that fits
 *   neither side. Applied on mount only: re-running it on resize would undo a
 *   width the user had dragged themselves.
 */
import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react"

const useIsomorphicLayoutEffect =
  typeof globalThis.window === 'undefined' ? useEffect : useLayoutEffect

interface UseResizableLayoutOptions {
  initialWidth?: number
  minWidth?: number
  maxWidth?: number
  preferLeftContentPx?: number
}

/**
 * Smallest split percentage that gives the left panel `targetPx`, or null when
 * that would need more than `maxPct`. Never returns less than `currentPct`:
 * this widens a split, it does not narrow one.
 */
export function preferredSplitPercent(
  usablePx: number,
  targetPx: number,
  currentPct: number,
  maxPct: number,
): number | null {
  if (!(usablePx > 0) || !(targetPx > 0)) return null
  const required = (targetPx / usablePx) * 100
  if (required > maxPct) return null
  return Math.max(currentPct, required)
}

export function useResizableLayout(options: UseResizableLayoutOptions = {}) {
  const {
    initialWidth = 50,
    minWidth = 30,
    maxWidth = 70,
    preferLeftContentPx,
  } = options

  const [leftWidth, setLeftWidth] = useState(initialWidth)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLElement>(null)

  const handleMouseDown = useCallback(() => {
    setIsDragging(true)
  }, [])

  // Measured, not guessed: the panels size against the container's CONTENT
  // box, so the container's own padding is already excluded from this rect's
  // usable width only after subtracting it. Runs before paint so the split
  // never visibly jumps from 50%.
  useIsomorphicLayoutEffect(() => {
    if (!preferLeftContentPx) return
    const container = containerRef.current
    if (!container) return
    const style = window.getComputedStyle(container)
    const usable = container.getBoundingClientRect().width
      - parseFloat(style.paddingLeft || '0')
      - parseFloat(style.paddingRight || '0')
    if (!(usable > 0)) return
    setLeftWidth((current) => (
      preferredSplitPercent(usable, preferLeftContentPx, current, maxWidth) ?? current
    ))
    // Mount-only by design (see preferLeftContentPx above).
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return
      
      const container = containerRef.current
      const rect = container.getBoundingClientRect()
      const newLeftWidth = ((e.clientX - rect.left) / rect.width) * 100
      
      // Limit between min and max
      if (newLeftWidth >= minWidth && newLeftWidth <= maxWidth) {
        setLeftWidth(newLeftWidth)
      }
    }
    
    const handleMouseUp = () => {
      setIsDragging(false)
    }
    
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging, minWidth, maxWidth])

  return {
    leftWidth,
    isDragging,
    containerRef,
    handleMouseDown,
  }
}
