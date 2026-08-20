// Typeahead that jumps the 累積報告 to one analyte column.
//
// Without it, finding a single analyte means guessing which category tab holds
// it (血液 / 生化 / 內分泌 / 血脂 / 血糖…) and then scrolling sideways through
// dozens of columns — the slowest interaction in the reports workspace on an
// iPad. The scroll-and-highlight machinery already exists (focusAnalyteKey →
// LabPivotTable centres the matching column); this is only the entry point to
// it, so picking a result switches category AND focuses the column.
"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Search, X } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAudience } from "@/src/application/providers/audience.provider"
import { getAnalyteDisplayParts } from "@/src/shared/utils/lab-normalize"
import type { AnalyteNameMode, DisplayLang } from "@/src/shared/utils/lab-normalize"
import type { LabPivot } from "../hooks/useLabPivot"

export interface AnalyteHit {
  categoryId: string
  categoryLabel: string
  /** Column identity the focus machinery matches on (`data-lab-test-key`). */
  testKey: string
  /** Label shown in the result row — the same text the column header renders. */
  label: string
  /** Secondary line: canonical/lay alternative plus the unit, when they add info. */
  detail: string | null
  /** False when the category pins this column but the patient has no result. */
  hasData: boolean
}

const MAX_HITS = 8

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * Build the searchable index over every category's columns.
 *
 * Deliberately indexes more than the rendered label: a clinician may type the
 * canonical short code (`HB`), the lay Chinese name (血紅素) or the institution's
 * own report name, and all three must find the same column.
 */
export function buildAnalyteIndex(
  pivots: LabPivot[],
  categoryLabels: Record<string, string>,
  nameMode: AnalyteNameMode,
  audience: "medical" | "patient",
  locale: DisplayLang,
): Array<AnalyteHit & { haystack: string[] }> {
  const seen = new Set<string>()
  const index: Array<AnalyteHit & { haystack: string[] }> = []

  for (const pivot of pivots) {
    const categoryId = pivot.category.id
    const categoryLabel = categoryLabels[categoryId] || categoryId
    for (const row of pivot.rows) {
      // One column per (category, testKey); a category can hold several mapKeys
      // for the same analyte and they all scroll to the same header.
      const dedupeKey = `${categoryId}:${row.testKey}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      const parts = getAnalyteDisplayParts(row.testKey, audience, locale)
      const label = nameMode === "original" || audience === "medical"
        ? row.displayName
        : parts.name
      const alternatives = [row.displayName, parts.name, parts.abbr, row.testKey]
        .filter((value): value is string => !!value && value !== label)
      const uniqueAlternatives = [...new Set(alternatives)]

      index.push({
        categoryId,
        categoryLabel,
        testKey: row.testKey,
        label,
        detail: [uniqueAlternatives[0], row.unit].filter(Boolean).join(" · ") || null,
        hasData: row.values.size > 0,
        haystack: [label, ...uniqueAlternatives].map(normalize),
      })
    }
  }
  return index
}

export function matchAnalytes(
  index: Array<AnalyteHit & { haystack: string[] }>,
  query: string,
): AnalyteHit[] {
  const q = normalize(query)
  if (!q) return []
  // Prefix matches first: typing "cr" should offer CREA before a mid-string
  // match buried in a long institution report name.
  const prefix: AnalyteHit[] = []
  const contains: AnalyteHit[] = []
  for (const entry of index) {
    if (entry.haystack.some((value) => value.startsWith(q))) prefix.push(entry)
    else if (entry.haystack.some((value) => value.includes(q))) contains.push(entry)
    if (prefix.length >= MAX_HITS) break
  }
  return [...prefix, ...contains].slice(0, MAX_HITS)
}

interface AnalyteSearchBoxProps {
  pivots: LabPivot[]
  categoryLabels: Record<string, string>
  nameMode: AnalyteNameMode
  onPick: (hit: AnalyteHit) => void
  className?: string
}

export function AnalyteSearchBox({
  pivots,
  categoryLabels,
  nameMode,
  onPick,
  className,
}: AnalyteSearchBoxProps) {
  const { locale } = useLanguage()
  const { audience } = useAudience()
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const zh = locale.startsWith("zh")

  const index = useMemo(
    () => buildAnalyteIndex(
      pivots,
      categoryLabels,
      nameMode,
      audience,
      locale.startsWith("zh") ? "zh-TW" : "en",
    ),
    [pivots, categoryLabels, nameMode, audience, locale],
  )
  const hits = useMemo(() => matchAnalytes(index, query), [index, query])

  // Keep the highlighted row inside the current result set instead of resetting
  // it from an effect (which would cost an extra render per keystroke).
  const safeActiveIndex = activeIndex < hits.length ? activeIndex : 0

  // Dismiss on outside click so the list never covers the table after use.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  const choose = (hit: AnalyteHit) => {
    onPick(hit)
    setQuery("")
    setOpen(false)
    setActiveIndex(0)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!hits.length) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((safeActiveIndex + 1) % hits.length)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((safeActiveIndex - 1 + hits.length) % hits.length)
    } else if (event.key === "Enter") {
      event.preventDefault()
      const hit = hits[safeActiveIndex]
      if (hit) choose(hit)
    } else if (event.key === "Escape") {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className={`relative min-w-0 ${className ?? ""}`}>
      <Search
        className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        type="search"
        inputMode="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-1p-ignore="true"
        data-lpignore="true"
        value={query}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIndex(0) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls="analyte-search-results"
        aria-label={zh ? "搜尋檢驗項目" : "Search analytes"}
        placeholder={zh ? "找檢驗項目…" : "Find an analyte…"}
        // 16px on phones: anything smaller makes iOS Safari zoom on focus.
        className="min-h-[36px] w-full rounded-md border border-input bg-background py-0 pl-7 pr-7 text-[16px] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring md:min-h-0 md:py-1 md:text-xs [&::-webkit-search-cancel-button]:appearance-none"
      />
      {query && (
        <button
          type="button"
          onClick={() => { setQuery(""); setOpen(false) }}
          aria-label={zh ? "清除" : "Clear"}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {open && query.trim() !== "" && (
        <ul
          id="analyte-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+2px)] z-40 max-h-64 overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-lg"
        >
          {hits.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              {zh ? "找不到符合的檢驗項目。" : "No matching analyte."}
            </li>
          ) : (
            hits.map((hit, position) => (
              <li key={`${hit.categoryId}:${hit.testKey}`} role="option" aria-selected={position === safeActiveIndex}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(position)}
                  onClick={() => choose(hit)}
                  className={`flex min-h-[44px] w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition-colors md:min-h-8 ${
                    position === safeActiveIndex ? "bg-accent" : "hover:bg-accent/60"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">
                      {hit.label}
                      {!hit.hasData && (
                        <span className="ml-1 font-normal text-muted-foreground">
                          {zh ? "（無資料）" : "(no data)"}
                        </span>
                      )}
                    </span>
                    {hit.detail && (
                      <span className="block truncate text-[0.625rem] text-muted-foreground">{hit.detail}</span>
                    )}
                  </span>
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[0.625rem] text-muted-foreground">
                    {hit.categoryLabel}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
