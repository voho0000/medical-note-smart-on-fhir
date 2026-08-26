// Right-panel scroll policy — where a feature's content scrolls, and what that
// implies for the tab panel's own sizing.
//
// This is deliberately a tiny pure module rather than part of the layout
// component: the two things it decides (which wrapper the layout renders, and
// how the panel sizes itself) MUST agree, and keeping them in one place is what
// stops a registry entry from silently disagreeing with its own wrapper.

export type RightPanelScrollMode = 'panel' | 'feature' | 'self'

export const DEFAULT_RIGHT_PANEL_SCROLL_MODE: RightPanelScrollMode = 'feature'

export function resolveScrollMode(mode?: RightPanelScrollMode): RightPanelScrollMode {
  return mode ?? DEFAULT_RIGHT_PANEL_SCROLL_MODE
}

/**
 * Structural classes for a feature's tab panel.
 *
 * The panel is a flex child of a fixed-height column, so whether it may shrink
 * is exactly what decides where scrolling happens:
 *
 *  - `feature` / `self` — the scrollport lives INSIDE the panel, so the panel
 *    must be allowed to shrink below its content (`min-h-0`). Without it the
 *    panel grows to content height, the `h-full` ScrollArea grows with it, and
 *    the tab cannot scroll at all — while that viewport's `overscroll-contain`
 *    also swallows the wheel instead of passing it to the panel that could have
 *    scrolled. The dead state is invisible until a feature's content first
 *    grows past the viewport, which is why it kept shipping unnoticed.
 *  - `panel` — the right column OUTSIDE is the scrollport, so the panel must be
 *    free to grow past the viewport; `min-h-0` would trap the content it is
 *    supposed to hand upward.
 */
export function tabPanelClasses(mode?: RightPanelScrollMode): string {
  return resolveScrollMode(mode) === 'panel'
    ? 'flex-1 mt-1'
    : 'flex-1 min-h-0 mt-1'
}
