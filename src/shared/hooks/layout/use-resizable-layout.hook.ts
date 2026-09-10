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
  const containerRef = useRef<HTMLElement | null>(null)
  // A split the reader chose is theirs; nothing recomputes it afterwards.
  const userAdjustedRef = useRef(false)
  // The workspace does not exist until a patient is loaded, so a plain ref
  // object is still null when the effects below first run — and nothing would
  // ever tell them it had arrived. This callback ref re-renders on attach,
  // which is what actually starts the measuring.
  const [containerEl, setContainerEl] = useState<HTMLElement | null>(null)
  // null until measured. `false` means even `maxWidth` leaves the left panel
  // short of `preferLeftContentPx` — the caller decides what to do about a
  // display that simply cannot show the layout the split exists for.
  const [preferredWidthReachable, setPreferredWidthReachable] =
    useState<boolean | null>(null)
  const attachContainer = useCallback((element: HTMLElement | null) => {
    // A width the reader chose belongs to the workspace they chose it in, not
    // to the browser session. Clearing the patient unmounts the workspace and
    // importing another mounts a fresh one, which is a new reading task and
    // should start from the default split again — otherwise a single visit to
    // 「回到左右各半」 silently disables the preferred width for every patient
    // loaded afterwards.
    if (element && element !== containerRef.current) userAdjustedRef.current = false
    containerRef.current = element
    setContainerEl(element)
  }, [])

  const handleMouseDown = useCallback(() => {
    setIsDragging(true)
  }, [])

  // Measured, not guessed: the panels size against the container's CONTENT
  // box, so its padding has to come off this rect. Runs before paint so the
  // split never visibly jumps from 50%.
  //
  // Re-measured on every container resize, not just on mount. Browser zoom
  // changes the viewport in CSS pixels without remounting anything, so a
  // mount-only version silently left the split at a percentage computed for
  // the old size — at 110% zoom the panel fell back under the target and the
  // layout it was widened for never appeared. `userAdjustedRef` is what keeps
  // that from fighting the reader: the moment they drag the divider or use its
  // controls, this stops touching the split for the rest of the session.
  const applyPreferredWidth = useCallback(() => {
    if (!preferLeftContentPx) return
    const container = containerRef.current
    if (!container) return
    const style = window.getComputedStyle(container)
    const usable = container.getBoundingClientRect().width
      - parseFloat(style.paddingLeft || '0')
      - parseFloat(style.paddingRight || '0')
    if (!(usable > 0)) return
    // Reachability is a property of the DISPLAY, not of the reader's choices,
    // so it is measured even after they have set their own width.
    const reachable = preferredSplitPercent(usable, preferLeftContentPx, minWidth, maxWidth)
    setPreferredWidthReachable(reachable !== null)
    if (userAdjustedRef.current) return
    setLeftWidth((current) => (
      preferredSplitPercent(usable, preferLeftContentPx, current, maxWidth) ?? current
    ))
  }, [maxWidth, minWidth, preferLeftContentPx])

  useIsomorphicLayoutEffect(() => {
    if (!preferLeftContentPx || !containerEl) return
    if (typeof ResizeObserver === 'undefined') return
    applyPreferredWidth()
    // Setting the split changes a CHILD's width, never this container's, so
    // this observer cannot feed itself.
    const observer = new ResizeObserver(() => applyPreferredWidth())
    observer.observe(containerEl)
    return () => observer.disconnect()
  }, [applyPreferredWidth, containerEl, preferLeftContentPx])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return
      
      const container = containerRef.current
      const rect = container.getBoundingClientRect()
      const newLeftWidth = ((e.clientX - rect.left) / rect.width) * 100
      
      // Limit between min and max
      if (newLeftWidth >= minWidth && newLeftWidth <= maxWidth) {
        userAdjustedRef.current = true
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

  // `setLeftWidth` is exported so the divider's controls can move the split to
  // a named stop (see the shell's step-then-collapse handlers) rather than
  // only ever jumping to a collapsed panel.
  const setWidth = useCallback((percent: number) => {
    userAdjustedRef.current = true
    setLeftWidth(Math.min(maxWidth, Math.max(minWidth, percent)))
  }, [maxWidth, minWidth])

  // Forget the reader's manual split and measure again. The caller decides
  // when the current reading task has ended — loading a DIFFERENT patient does
  // not remount the workspace (only its data changes), so the container-attach
  // reset above never fires on that path, which is the common one.
  const resetPreferredWidth = useCallback(() => {
    userAdjustedRef.current = false
    applyPreferredWidth()
  }, [applyPreferredWidth])

  return {
    leftWidth,
    isDragging,
    containerRef: attachContainer,
    handleMouseDown,
    setLeftWidth: setWidth,
    resetPreferredWidth,
    preferredWidthReachable,
  }
}
