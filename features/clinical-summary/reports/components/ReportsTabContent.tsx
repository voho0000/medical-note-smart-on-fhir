// Reports Tab Content Component
//
// Virtualised list — only rows currently visible in the scroll viewport are
// rendered, regardless of total count. With 500+ rows in "全部" / "檢驗" tabs
// this is the difference between a 1.5s tab switch and an instant one. Each
// ReportRow has variable height (some expand into accordions), so we use
// @tanstack/react-virtual's dynamic-measurement mode.
//
// Scroll container: this component owns a flex column that scrolls
// internally. Outside fullscreen mode we cap it at ~60vh so a single huge
// tab doesn't push everything below the fold; in fullscreen the cap is
// lifted via `fullHeight`.
import { memo, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { TabsContent } from "@/components/ui/tabs"
import type { Row } from '../types'
import { ReportRow } from './ReportRow'

interface ReportsTabContentProps {
  value: string
  rows: Row[]
  /** When true, take remaining vertical space and scroll internally
   *  (used in fullscreen mode where the parent has overflow-hidden). */
  fullHeight?: boolean
  /** When true, keep this content mounted across tab switches (Radix
   *  hides inactive via CSS). Driven by parent's "visited tabs" set so
   *  unvisited tabs don't mount upfront. */
  forceMount?: true
  /** Row ids whose accordion should start open — used by the parent to
   *  auto-expand rows whose search match came from an inner observation
   *  (e.g. "RBC" inside "全套血液檢查Ⅰ"), so the user can see the matched
   *  item without an extra click. */
  defaultOpenIds?: string[]
  /** True when a search query is active, so the empty state can say "no
   *  matches" instead of the misleading "no data in this category". */
  searchActive?: boolean
  /** Active search query — forwarded to ReportRow to highlight title matches. */
  query?: string
}

// Stable fallback so referential equality holds when no expand list is
// provided — keeps React.memo on ReportRow skipping.
const EMPTY_OPEN_IDS: string[] = []

// Initial guess for each row's height before the virtualizer measures it.
// Most rows are single-line compact cards (~64px); a generous estimate
// keeps over-rendering low at startup but the measurement step corrects
// any drift as soon as rows are in the DOM.
const ESTIMATED_ROW_HEIGHT = 72

function ReportsTabContentImpl({ value, rows, fullHeight = false, forceMount, defaultOpenIds, searchActive, query }: ReportsTabContentProps) {
  const openIds = defaultOpenIds ?? EMPTY_OPEN_IDS
  // Callback-ref-into-state pattern: when the scroll div attaches, React
  // calls setScrollEl with the element. That triggers a re-render whose
  // useVirtualizer call reads the now-non-null element and measures
  // immediately. A plain useRef + getScrollElement returning ref.current
  // doesn't re-render when the ref attaches, so the virtualizer's first
  // measurement happens against a null scrollElement and getVirtualItems
  // returns []. See @tanstack/react-virtual issue #846 for the workaround.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    // Keep a small buffer above/below the viewport so users don't see a
    // flash of blank when they scroll quickly. 6 rows ≈ half a screen.
    overscan: 6,
    // Stable key so virtualizer can preserve measured heights across
    // re-renders triggered by props changing — without it, every parent
    // re-render would reset the measurement cache and re-estimate.
    getItemKey: (index) => rows[index]?.id ?? index,
  })

  const items = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()

  return (
    <TabsContent
      value={value}
      forceMount={forceMount}
      className={fullHeight ? 'mt-0 flex-1 min-h-0' : 'mt-0'}
    >
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          {searchActive ? '沒有符合搜尋的報告' : 'No reports available in this category.'}
        </div>
      ) : (
        <div
          ref={setScrollEl}
          className={
            fullHeight
              ? 'h-full overflow-y-auto pr-1'
              // Non-fullscreen mode: an explicit, rem-based height so the
              // virtualizer can measure the viewport immediately — a flex/max-h
              // child collapses to 0 at mount (no positioned content yet
              // establishes flow height) and renders an empty list. It fills the
              // panel: 100vh minus the chrome above the list (app header + tabs
              // + sub-tabs + search ≈ 18rem). Because the offset is in REM it
              // scales with the font-size setting, so 特小 shows MORE rows
              // instead of leaving dead space below a fixed-vh card. min-h keeps
              // it usable on very short screens.
              : 'h-[calc(100vh-18rem)] min-h-[18rem] overflow-y-auto pr-1'
          }
        >
          {/* Outer spacer sized to the *full* list height so the scrollbar
              reflects the real total; absolute-positioned children let the
              virtualizer place only the visible window. */}
          <div
            style={{
              height: `${totalSize}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {items.map((virtualRow) => {
              const row = rows[virtualRow.index]
              if (!row) return null
              return (
                <div
                  key={virtualRow.key}
                  // measureElement attaches a ResizeObserver so the
                  // virtualizer learns each row's real height after mount,
                  // honouring accordion expansion / wrapping.
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    paddingBottom: '8px', // matches the old space-y-2 gap
                  }}
                >
                  <ReportRow row={row} defaultOpen={openIds} query={query} />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </TabsContent>
  )
}

// Memoized so parent re-renders (e.g. someone above changing state that
// doesn't affect this tab's props) don't trip the .map → ReportRow chain
// on every visited tab. Combined with React.memo on ReportRow this turns
// tab switches into a pure CSS hide/show for already-mounted tabs.
export const ReportsTabContent = memo(ReportsTabContentImpl)
