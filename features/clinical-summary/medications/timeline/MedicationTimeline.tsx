// Medication timeline (Gantt-style refill history).
//
// PR 1 scope: drug-grouped Gantt timeline with time-range selector and
// hover tooltip. Filter chips / pharmacy mode / adherence-gap warnings
// land in later PRs (see plan in conversation).
"use client"

import { useState, useRef, useEffect } from 'react'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAudience } from '@/src/application/providers/audience.provider'
import { TapTooltip } from '@/src/shared/components/TapTooltip'
import { cn } from '@/src/shared/utils/cn.utils'
import {
  useMedicationTimeline,
  type TimeRange,
  type TimelineAtcLevel,
  type TimelineGroupingMode,
} from './hooks/useMedicationTimeline'
import { TimelineSvg } from './components/TimelineSvg'
import {
  medicationChronicSwatchClass,
  medicationFutureTimelineSwatchClass,
  medicationNonChronicSwatchClass,
  medicationUnrecordedSwatchClass,
} from '../components/medication-chip-styles'

const RANGES: TimeRange[] = ['3m', '6m', '1y', '3y', 'all']

// User preference: open at 3-months for everyone. After the user picks a
// different range we persist it to localStorage so it sticks across tab
// switches / page reloads within the same browser.
const DEFAULT_RANGE: TimeRange = '3m'
const RANGE_STORAGE_KEY = 'medication-timeline-range'
const GROUPING_STORAGE_KEY = 'medication-timeline-grouping'
const ATC_LEVEL_STORAGE_KEY = 'medication-timeline-atc-level'

function isValidRange(v: unknown): v is TimeRange {
  return v === '3m' || v === '6m' || v === '1y' || v === '3y' || v === 'all'
}

function isValidGroupingMode(v: unknown): v is TimelineGroupingMode {
  return v === 'atc' || v === 'organization'
}

function isValidAtcLevel(v: unknown): v is TimelineAtcLevel {
  return v === '2' || v === '4'
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
  const [groupingMode, setGroupingModeState] = useState<TimelineGroupingMode>('atc')
  const [atcLevel, setAtcLevelState] = useState<TimelineAtcLevel>('4')
  useEffect(() => {
    try {
      const storedRange = window.localStorage.getItem(RANGE_STORAGE_KEY)
      const storedGrouping = window.localStorage.getItem(GROUPING_STORAGE_KEY)
      const storedAtcLevel = window.localStorage.getItem(ATC_LEVEL_STORAGE_KEY)
      // Post-hydration preference restore keeps the server and first client
      // render identical while still honoring the saved range.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (isValidRange(storedRange)) setRangeState(storedRange)
      if (isValidGroupingMode(storedGrouping)) setGroupingModeState(storedGrouping)
      if (storedAtcLevel === '3' || storedAtcLevel === 'auto') {
        setAtcLevelState('4')
        window.localStorage.setItem(ATC_LEVEL_STORAGE_KEY, '4')
      } else if (isValidAtcLevel(storedAtcLevel)) {
        setAtcLevelState(storedAtcLevel)
      }
    } catch { /* storage unavailable — silently keep default */ }
  }, [])
  const setRange = (next: TimeRange) => {
    setRangeState(next)
    try { window.localStorage.setItem(RANGE_STORAGE_KEY, next) } catch {}
  }
  const setGroupingMode = (next: TimelineGroupingMode) => {
    setGroupingModeState(next)
    try { window.localStorage.setItem(GROUPING_STORAGE_KEY, next) } catch {}
  }
  const setAtcLevel = (next: TimelineAtcLevel) => {
    setAtcLevelState(next)
    try { window.localStorage.setItem(ATC_LEVEL_STORAGE_KEY, next) } catch {}
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
    groupingMode,
    atcLevel,
    mt.timelineUnknownOrganization ?? '未提供機構',
  )

  return (
    <div className="space-y-2">
      {/* ── Grouping controls, range, and legend ────────────────────── */}
      <div className="space-y-2 border-b pb-2">
        <div
          data-timeline-primary-controls
          className="flex flex-wrap items-center gap-x-3 gap-y-2 md:flex-nowrap md:overflow-x-auto"
        >
          <div className="flex shrink-0 items-center gap-2">
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {mt.timelineRangeLabel ?? '時段'}
            </span>
            <div
              role="group"
              aria-label={mt.timelineRangeLabel ?? '時段'}
              className="inline-flex min-w-0 overflow-hidden rounded-md border bg-background md:p-0.5"
            >
              {RANGES.map((r, index) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={range === r}
                  onClick={() => setRange(r)}
                  className={cn(
                    'min-h-[44px] min-w-0 whitespace-nowrap border-l px-2.5 text-xs font-medium transition-colors first:border-l-0 focus-visible:z-10 md:min-h-0 md:rounded-sm md:px-2 md:py-1',
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

          <div className="flex shrink-0 items-center gap-2">
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {mt.timelineGroupingLabel ?? '分組'}
            </span>
            <div
              role="group"
              aria-label={mt.timelineGroupingLabel ?? '分組'}
              className="inline-flex overflow-hidden rounded-md border bg-background md:p-0.5"
            >
              {(['atc', 'organization'] as const).map((mode, index) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={groupingMode === mode}
                  onClick={() => setGroupingMode(mode)}
                  className={cn(
                    'min-h-[44px] whitespace-nowrap border-l px-3 text-xs font-medium transition-colors first:border-l-0 focus-visible:z-10 md:min-h-0 md:rounded-sm md:py-1',
                    groupingMode === mode
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                    index === 0 && 'border-l-0',
                  )}
                >
                  {mode === 'atc'
                    ? mt.timelineGroupingAtc ?? 'ATC 藥理'
                    : mt.timelineGroupingOrganization ?? '醫療機構'}
                </button>
              ))}
            </div>
          </div>

          {groupingMode === 'atc' ? (
            <div className="flex shrink-0 items-center gap-2">
              <span className="shrink-0 text-xs font-medium text-muted-foreground">
                {mt.timelineAtcDetailLabel ?? '藥理分類'}
              </span>
              <div
                role="group"
                aria-label={mt.timelineAtcDetailLabel ?? '藥理分類'}
                className="inline-flex overflow-hidden rounded-md border bg-background md:p-0.5"
              >
                {(['2', '4'] as const).map((level, index) => (
                  <button
                    key={level}
                    type="button"
                    aria-pressed={atcLevel === level}
                    onClick={() => setAtcLevel(level)}
                    className={cn(
                      'min-h-[44px] whitespace-nowrap border-l px-3 text-xs font-medium transition-colors first:border-l-0 focus-visible:z-10 md:min-h-0 md:rounded-sm md:py-1',
                      atcLevel === level
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                      index === 0 && 'border-l-0',
                    )}
                  >
                    {level === '2'
                      ? mt.timelineAtcBroad ?? '粗分'
                      : mt.timelineAtcDetailed ?? '細分'}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Text labels accompany every swatch so the chart never requires
              colour-only interpretation. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground tabular-nums">
            {data.totalDrugs > 0 ? (
              <>
              <span className="font-medium text-foreground">
                {data.totalDrugs} {mt.timelineDrugCount ?? 'drugs'}
                {groupingMode === 'organization' ? (
                  <>
                    {' · '}{data.totalRows} {mt.timelineOrganizationRowCount ?? 'organization rows'}
                    {' · '}{data.organizationCount} {mt.timelineOrganizationCount ?? 'organizations'}
                  </>
                ) : null}
              </span>
              <span
                role="group"
                aria-label={mt.timelinePrescriptionType ?? 'Prescription type'}
                className="inline-flex items-center gap-2 border-l border-border/80 pl-2"
              >
                {data.chronicCount > 0 ? <span className="inline-flex items-center gap-1 whitespace-nowrap">
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
                </span> : null}
                {data.nonChronicCount > 0 ? <span className="inline-flex items-center gap-1 whitespace-nowrap">
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
                </span> : null}
                {data.unrecordedCount > 0 ? (
                  <TapTooltip
                    content={mt.timelinePrescriptionTypeUnrecordedTooltip
                      ?? 'This source does not provide prescription-type metadata.'}
                    contentTestId="timeline-prescription-type-unrecorded-tooltip"
                    contentClassName="max-w-[min(90vw,24rem)] whitespace-normal text-left"
                  >
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "inline-block h-2 w-3 rounded-[2px] border",
                          medicationUnrecordedSwatchClass,
                        )}
                      />
                      <span>{mt.timelinePrescriptionTypeUnrecorded ?? 'Prescription type not recorded'}</span>
                      <span className="font-medium text-foreground">
                        {data.unrecordedCount}
                      </span>
                    </span>
                  </TapTooltip>
                ) : null}
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
