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

const DEFAULT_RANGE: Record<'medical' | 'patient', TimeRange> = {
  medical: '3y',
  patient: '6m',
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
  const [range, setRange] = useState<TimeRange>(DEFAULT_RANGE[audience])
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
      <div className="text-xs text-muted-foreground">
        {data.totalDrugs > 0 ? (
          <>
            {data.totalDrugs} {mt.timelineDrugCount ?? 'drugs'} ·{' '}
            <span className="text-violet-700">
              {data.chronicCount} {mt.chronic ?? '慢箋'}
            </span>{' '}
            ·{' '}
            <span className="text-slate-700">
              {data.acuteCount} {mt.timelineAcute ?? 'acute'}
            </span>
          </>
        ) : (
          mt.timelineEmpty ?? '此時段內無用藥紀錄'
        )}
      </div>

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

      {/* ── Legend ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-violet-400 border border-violet-600" />
          {mt.chronic ?? '慢箋'}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-slate-300 border border-slate-600" />
          {mt.timelineAcute ?? 'Acute'}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-px w-3 border-t border-dashed border-red-500" />
          {mt.timelineToday ?? 'Today'}
        </span>
      </div>
    </div>
  )
}
