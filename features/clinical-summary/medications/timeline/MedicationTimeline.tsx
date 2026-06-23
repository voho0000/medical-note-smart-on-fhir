// Medication timeline (Gantt-style refill history).
//
// PR 1 scope: drug-grouped Gantt timeline with time-range selector and
// hover tooltip. Filter chips / pharmacy mode / adherence-gap warnings
// land in later PRs (see plan in conversation).
"use client"

import { useState, useRef, useEffect } from 'react'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAudience } from '@/src/application/providers/audience.provider'
import { cn } from '@/src/shared/utils/cn.utils'
import { useMedicationTimeline, type TimeRange } from './hooks/useMedicationTimeline'
import { TimelineSvg } from './components/TimelineSvg'

const RANGES: TimeRange[] = ['3m', '6m', '1y', '3y', 'all']

// User preference: open at 3-months for everyone. After the user picks a
// different range we persist it to localStorage so it sticks across tab
// switches / page reloads within the same browser.
const DEFAULT_RANGE: TimeRange = '3m'
const RANGE_STORAGE_KEY = 'medication-timeline-range'

function isValidRange(v: unknown): v is TimeRange {
  return v === '3m' || v === '6m' || v === '1y' || v === '3y' || v === 'all'
}

interface MedicationTimelineProps {
  medications: any[]
}

export function MedicationTimeline({ medications }: MedicationTimelineProps) {
  const { t, locale } = useLanguage()
  const { audience } = useAudience()
  const mt = (t.medications as any)
  const fallbackCategoryLabel = mt.timelineOtherCategory ?? '其他'
  const rangeLabels: Record<TimeRange, string> = {
    '3m': mt.timelineRange3m ?? '3個月',
    '6m': mt.timelineRange6m ?? '6個月',
    '1y': mt.timelineRange1y ?? '1年',
    '3y': mt.timelineRange3y ?? '3年',
    all: mt.timelineRangeAll ?? '全部',
  }
  // Start with DEFAULT_RANGE on every render so SSR and the first client
  // render match (avoids the hydration mismatch we hit earlier with bundle
  // status). The persisted choice is loaded in useEffect below.
  const [range, setRangeState] = useState<TimeRange>(DEFAULT_RANGE)
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(RANGE_STORAGE_KEY)
      if (isValidRange(stored)) setRangeState(stored)
    } catch { /* storage unavailable — silently keep default */ }
  }, [])
  const setRange = (next: TimeRange) => {
    setRangeState(next)
    try { window.localStorage.setItem(RANGE_STORAGE_KEY, next) } catch {}
  }
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? 0
      setContainerWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const data = useMedicationTimeline(medications, audience, range, fallbackCategoryLabel, locale)

  return (
    <div className="space-y-2">
      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground mr-1">
          {mt.timelineRangeLabel ?? '時段'}:
        </span>
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
              range === r
                ? 'bg-primary text-primary-foreground'
                : 'border bg-background text-foreground hover:bg-muted',
            )}
          >
            {rangeLabels[r]}
          </button>
        ))}
      </div>

      {/* ── Summary line ────────────────────────────────────────────── */}
      {/* The chronic / acute counts carry their own colour swatch (matching the
          bar colours), so a separate 慢箋/急性 legend below would just repeat the
          text — only the 今日 key remains in the legend. */}
      <div className="text-xs text-muted-foreground">
        {data.totalDrugs > 0 ? (
          <>
            {data.totalDrugs} {mt.timelineDrugCount ?? 'drugs'} ·{' '}
            <span className="inline-flex items-center gap-1 align-middle text-violet-700">
              <span className="inline-block h-2 w-3 rounded-sm bg-violet-400 border border-violet-600" />
              {data.chronicCount} {mt.chronic ?? '慢箋'}
            </span>{' '}
            ·{' '}
            <span className="inline-flex items-center gap-1 align-middle text-slate-700">
              <span className="inline-block h-2 w-3 rounded-sm bg-slate-300 border border-slate-600" />
              {data.acuteCount} {mt.timelineAcute ?? 'acute'}
            </span>{' '}
            ·{' '}
            {/* 今日 (red dashed line) key inline on the same row, not a separate
                legend line below. */}
            <span className="inline-flex items-center gap-1 align-middle">
              <span className="inline-block h-px w-3 border-t border-dashed border-red-500" />
              {mt.timelineToday ?? 'Today'}
            </span>
          </>
        ) : (
          mt.timelineEmpty ?? '此時段內無用藥紀錄'
        )}
      </div>

      {/* Legend is folded into the summary row above (慢箋/急性 swatches on the
          counts, 今日 key inline) — no separate legend line. */}

      {/* ── Timeline SVG ─────────────────────────────────────────────── */}
      <div ref={containerRef} className="w-full overflow-hidden rounded-md border bg-background">
        {containerWidth > 0 && data.categories.length > 0 && (
          <TimelineSvg
            categories={data.categories}
            domainStartMs={data.domainStartMs}
            domainEndMs={data.domainEndMs}
            width={containerWidth}
          />
        )}
        {data.categories.length === 0 && (
          <div className="py-8 text-center text-xs text-muted-foreground">
            {mt.timelineEmpty ?? '此時段內無用藥紀錄'}
          </div>
        )}
      </div>
    </div>
  )
}
