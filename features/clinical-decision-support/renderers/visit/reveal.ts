/**
 * Moving the page to what a press on the decision map opened — only as far as
 * it has to. Beside the column of points the details are often already on
 * screen, and a press that jumps them to the top anyway moves the page for
 * nothing (clinician feedback 2026-09-29).
 */

/** The nearest ancestor that scrolls; undefined where the page itself does. */
export function scrollParentOf(element: Element): HTMLElement | undefined {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent)
    if ((overflowY === 'auto' || overflowY === 'scroll') && parent !== document.documentElement) return parent
  }
  return undefined
}

/**
 * Brings `element` into view by as little as it takes: nothing when its top is
 * already in the upper part of what the clinician sees; just far enough to
 * show all of it when it fits below; else its top to the top.
 */
export function revealTop(element: Element | null | undefined): void {
  if (!element) return
  const box = element.getBoundingClientRect()
  const scroller = scrollParentOf(element)
  const view = scroller ? scroller.getBoundingClientRect() : { top: 0, height: window.innerHeight }
  const offset = box.top - view.top
  if (box.height > 0 && offset >= 0 && offset <= view.height * 0.6) return
  const fitsBelow = box.height > 0 && offset > 0 && box.height <= view.height * 0.8
  element.scrollIntoView?.({ block: fitsBelow ? 'nearest' : 'start' })
}
