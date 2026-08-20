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
import {
  medicationChronicSwatchClass,
  medicationFutureTimelineSwatchClass,
  medicationNonChronicSwatchClass,
} from '../components/medication-chip-styles'

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
  const atcCategoryLabels: Record<string, string> = mt.timelineAtcCategories ?? {}
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
      // Post-hydration preference restore keeps the server and first client
      // render identical while still honoring the saved range.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const data = useMedicationTimeline(
    medications,
    audience,
    range,
    fallbackCategoryLabel,
    locale,
    atcCategoryLabels,
  )

  return (
    <div className="space-y-2">
      {/* ── Compact toolbar + legend ────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {mt.timelineRangeLabel ?? '時段'}
          </span>
          <div
            role="group"
            aria-label={mt.timelineRangeLabel ?? '時段'}
            className="inline-flex min-w-0 overflow-hidden rounded-md border bg-background"
          >
            {RANGES.map((r, index) => (
              <button
                key={r}
                type="button"
                aria-pressed={range === r}
                onClick={() => setRange(r)}
                className={cn(
                  'min-h-[44px] min-w-0 border-l px-2.5 text-xs font-medium transition-colors first:border-l-0 focus-visible:z-10 sm:min-h-8 sm:px-3',
                  range === r
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                  index === 0 && 'border-l-0',
                )}
              >
                {rangeLabels[r]}
              </button>
            ))}
          </div>
        </div>

        {/* Text labels accompany every swatch so the chart never requires
            colour-only interpretation. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground tabular-nums">
          {data.totalDrugs > 0 ? (
            <>
              <span className="font-medium text-foreground">
                {data.totalDrugs} {mt.timelineDrugCount ?? 'drugs'}
              </span>
              <span
                role="group"
                aria-label={mt.timelinePrescriptionType ?? 'Prescription type'}
                className="inline-flex items-center gap-2 border-l border-border/80 pl-2"
              >
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "inline-block h-2 w-3 rounded-[2px] border",
                      medicationChronicSwatchClass,
                    )}
                  />
                  <span>{mt.chronic ?? 'Chronic Rx'}</span>
                  <span className="font-medium text-foreground">
                    {data.chronicCount}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "inline-block h-2 w-3 rounded-[2px] border",
                      medicationNonChronicSwatchClass,
                    )}
                  />
                  <span>{mt.timelineNonChronic ?? 'Non-chronic Rx'}</span>
                  <span className="font-medium text-foreground">
                    {data.nonChronicCount}
                  </span>
                </span>
              </span>
              <span
                role="group"
                aria-label={mt.timelineMedicationStatus ?? 'Medication status'}
                className="inline-flex items-center gap-2 border-l border-border/80 pl-2"
              >
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  <span
                    aria-hidden="true"
                    className="inline-block h-2 w-3 rounded-[2px] border border-primary/20 bg-primary/[0.06] dark:bg-primary/10"
                  />
                  {mt.timelineCurrentMedication ?? 'Current medication'}
                </span>
              </span>
              <span
                role="group"
                aria-label={mt.timelineTimeMarkers ?? 'Time markers'}
                className="inline-flex items-center gap-2 border-l border-border/80 pl-2"
              >
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  <span
                    aria-hidden="true"
                    className="inline-block h-px w-3 border-t border-dashed border-destructive"
                  />
                  {mt.timelineToday ?? 'Today'}
                </span>
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "inline-block h-2 w-3 rounded-[2px] border",
                      medicationFutureTimelineSwatchClass,
                    )}
                  />
                  {mt.timelineAfterToday ?? 'After today'}
                </span>
              </span>
            </>
          ) : (
            mt.timelineEmpty ?? '此時段內無用藥紀錄'
          )}
        </div>
      </div>

      {/* ── Timeline SVG ─────────────────────────────────────────────── */}
      <div ref={containerRef} className="w-full overflow-hidden rounded-md border bg-card">
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
