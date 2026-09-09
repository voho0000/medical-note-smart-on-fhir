import { useLayoutEffect, useRef, useState } from 'react'

type FitEntry = {
  element: HTMLDivElement
  publish: (compact: boolean) => void
  visible: boolean
  fontKey?: string
  requiredWidth?: number
  fontGeneration?: number
}

// One observer pair and one frame queue for the whole mounted medication list.
// Offscreen rows keep their last result, but do no layout reads until visible.
const entries = new Map<Element, FitEntry>()
const pending = new Set<FitEntry>()
let intersectionObserver: IntersectionObserver | undefined
let resizeObserver: ResizeObserver | undefined
let frame: number | undefined
let fontGeneration = 0
let removeListeners: (() => void) | undefined

function schedule(entry: FitEntry) {
  if (!entry.visible) return
  pending.add(entry)
  if (frame === undefined) frame = requestAnimationFrame(flush)
}

function flush() {
  frame = undefined
  const results: Array<[FitEntry, boolean]> = []
  for (const entry of pending) {
    const { element } = entry
    if (!entry.visible || entries.get(element) !== entry) continue
    const availableWidth = element.clientWidth
    if (!availableWidth) continue
    const style = getComputedStyle(element)
    const fontKey = [style.font, style.fontSize, style.fontFamily, style.fontWeight,
      style.letterSpacing, style.wordSpacing, style.fontVariant,
      style.fontFeatureSettings, style.fontVariationSettings, style.textTransform].join('|')
    if (entry.requiredWidth === undefined || entry.fontKey !== fontKey
      || entry.fontGeneration !== fontGeneration) {
      // Invisible end-date glyphs are included, preventing compact/full oscillation.
      const range = document.createRange()
      if (typeof range.getBoundingClientRect !== 'function') continue
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      let requiredWidth = 0
      while (walker.nextNode()) {
        range.selectNodeContents(walker.currentNode)
        requiredWidth += range.getBoundingClientRect().width
      }
      entry.requiredWidth = requiredWidth
      entry.fontKey = fontKey
      entry.fontGeneration = fontGeneration
    }
    results.push([entry, entry.requiredWidth > availableWidth + 1])
  }
  pending.clear()
  // Finish every layout read before publishing changes to React.
  for (const [entry, compact] of results) entry.publish(compact)
}

function scheduleVisible() {
  for (const entry of entries.values()) schedule(entry)
}

function startObservers() {
  if (removeListeners) return
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(changes => {
      for (const change of changes) {
        const entry = entries.get(change.target)
        if (entry) schedule(entry)
      }
    })
  }
  if (typeof IntersectionObserver !== 'undefined') {
    intersectionObserver = new IntersectionObserver(changes => {
      for (const change of changes) {
        const entry = entries.get(change.target)
        if (!entry) continue
        entry.visible = change.isIntersecting
        if (entry.visible) {
          resizeObserver?.observe(entry.element)
          schedule(entry)
        } else {
          resizeObserver?.unobserve(entry.element)
          pending.delete(entry)
        }
      }
    })
  }
  const fonts = document.fonts
  let disposed = false
  const fontsChanged = () => {
    if (disposed) return
    fontGeneration++
    scheduleVisible()
  }
  window.addEventListener('resize', scheduleVisible)
  fonts?.addEventListener('loadingdone', fontsChanged)
  void fonts?.ready.then(fontsChanged)
  removeListeners = () => {
    disposed = true
    window.removeEventListener('resize', scheduleVisible)
    fonts?.removeEventListener('loadingdone', fontsChanged)
  }
}

function subscribe(element: HTMLDivElement, publish: FitEntry['publish']) {
  startObservers()
  const entry: FitEntry = { element, publish, visible: !intersectionObserver }
  entries.set(element, entry)
  if (intersectionObserver) intersectionObserver.observe(element)
  else {
    resizeObserver?.observe(element)
    schedule(entry)
  }
  return () => {
    intersectionObserver?.unobserve(element)
    resizeObserver?.unobserve(element)
    pending.delete(entry)
    entries.delete(element)
    if (!entries.size) {
      intersectionObserver?.disconnect()
      resizeObserver?.disconnect()
      intersectionObserver = undefined
      resizeObserver = undefined
      removeListeners?.()
      removeListeners = undefined
      if (frame !== undefined) cancelAnimationFrame(frame)
      frame = undefined
      pending.clear()
    }
  }
}

/** Fit optional end dates using cached glyph widths, measuring visible rows only. */
export function useMedicationEndDateFit(enabled: boolean, contentKey: string) {
  const regimenRef = useRef<HTMLDivElement>(null)
  const [compactEndDate, setCompactEndDate] = useState(false)

  useLayoutEffect(() => {
    const element = regimenRef.current
    if (!element || !enabled) {
      setCompactEndDate(false)
      return
    }
    // A new subscription discards the old width when regimen text changes.
    return subscribe(element, setCompactEndDate)
  }, [enabled, contentKey])

  return { regimenRef, compactEndDate: enabled && compactEndDate }
}
