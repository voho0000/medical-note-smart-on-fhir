/**
 * Moving the page to what a press on the decision map opened — only as far as
 * it has to. Beside the column of points the details are often already on
 * screen, and a press that jumps them to the top anyway moves the page for
 * nothing (clinician feedback 2026-09-29).
 */

/**
 * The nearest ancestor that scrolls; undefined where the page itself does. An
 * ancestor that only could scroll — a layout's `overflow-y: auto` that grows
 * with what it holds — is passed over for the one whose content is taller than
 * it, and a clipping viewport that has yet to switch its scrollbar on (Radix's
 * ScrollArea, until its effect runs) counts once its content is taller.
 */
export function scrollParentOf(element: Element): HTMLElement | undefined {
  let couldScroll: HTMLElement | undefined
  for (let parent = element.parentElement; parent && parent !== document.body && parent !== document.documentElement; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent)
    const overflows = parent.scrollHeight > parent.clientHeight + 1
    if (overflowY === 'auto' || overflowY === 'scroll') {
      if (overflows) return parent
      couldScroll ??= parent
    } else if (overflowY === 'hidden' && overflows) {
      return parent
    }
  }
  return couldScroll
}

/**
 * Brings `element` into view by as little as it takes: nothing when its top is
 * already in the upper part of what the clinician sees; just far enough to
 * show all of it when it fits below; else its top to the top. What sits stuck
 * at the top of the view is the element's own `scroll-margin-top` to say, and
 * a top under it is not in view.
 */
export function revealTop(element: Element | null | undefined): void {
  if (!element) return
  const box = element.getBoundingClientRect()
  const scroller = scrollParentOf(element)
  const frame = scroller ? scroller.getBoundingClientRect() : { top: 0, height: window.innerHeight }
  const inset = Number.parseFloat(getComputedStyle(element).scrollMarginTop) || 0
  const view = { top: frame.top + inset, height: Math.max(0, frame.height - inset) }
  const offset = box.top - view.top
  if (box.height > 0 && offset >= 0 && offset <= view.height * 0.6) return
  const fitsBelow = box.height > 0 && offset > 0 && box.height <= view.height * 0.8
  element.scrollIntoView?.({ block: fitsBelow ? 'nearest' : 'start' })
}
