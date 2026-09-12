"use client"

import { useId, useState } from 'react'
import { Activity, ChevronDown, FileText, Pill } from 'lucide-react'
import { cn } from '@/src/shared/utils/cn.utils'
import type { CareTimelineEntry, CareTimelineEntryKind, CareTimelineModel } from './care-timeline'

/**
 * The course on one dated rail.
 *
 * Read as rows rather than drawn as a proportional axis on purpose: the three
 * things on this line are months apart and unevenly spaced, so a scaled axis
 * spends most of its width on the gaps and crushes the visits that matter into
 * each other. Rows keep every date legible at 320px, keep the zh-TW labels
 * unwrapped, and stay readable to a screen reader in the order they happened.
 *
 * Collapsed by default: this is the background to today's decision, not the
 * decision, and it sits below the cards that ask for something.
 */
const KIND_ICON: Record<CareTimelineEntryKind, typeof Activity> = {
  lvef: Activity,
  diagnosis: FileText,
  medication: Pill,
}

/**
 * The marker is never the only thing saying what a row is — each row also names
 * its kind in words, because a shape alone is not a state.
 */
const KIND_MARKER_STYLE: Record<CareTimelineEntryKind, string> = {
  lvef: 'border-primary/60 bg-primary/10 text-primary',
  diagnosis: 'border-border bg-muted text-muted-foreground',
  medication: 'border-teal-600/40 bg-teal-50 text-teal-800 dark:bg-teal-500/10 dark:text-teal-200',
}

function kindLabel(kind: CareTimelineEntryKind, isEnglish: boolean): string {
  if (kind === 'lvef') return isEnglish ? 'Ejection fraction' : '射出分率'
  if (kind === 'diagnosis') return isEnglish ? 'Diagnosis code' : '診斷碼'
  return isEnglish ? 'Prescription record' : '處方紀錄'
}

function TimelineRow({
  entry,
  isEnglish,
}: {
  entry: CareTimelineEntry
  isEnglish: boolean
}) {
  const Icon = KIND_ICON[entry.kind]
  const span = entry.endDate
    ? `${entry.date} → ${entry.endDate}`
    : entry.date
  return (
    <li
      className="relative grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2 pb-3 last:pb-0"
      data-testid={`cdss-hf-timeline-entry-${entry.id}`}
      data-kind={entry.kind}
    >
      {/* The rail itself, drawn behind every row but the last. */}
      <span
        className="absolute left-[0.6875rem] top-5 h-full w-px bg-border last:hidden"
        aria-hidden="true"
      />
      <span
        className={cn(
          'relative z-[1] mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border',
          KIND_MARKER_STYLE[entry.kind],
        )}
        aria-hidden="true"
      >
        <Icon className="h-3 w-3" />
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-xs font-semibold tabular-nums text-foreground">{span}</span>
          <span className="text-[11px] leading-4 text-muted-foreground">
            {kindLabel(entry.kind, isEnglish)}
          </span>
          {entry.ongoing ? (
            <span
              className="text-[11px] font-medium leading-4 text-teal-800 dark:text-teal-200"
              data-testid={`cdss-hf-timeline-ongoing-${entry.id}`}
            >
              {isEnglish ? 'still taking' : '使用中'}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-sm font-medium leading-5 text-foreground">{entry.label}</span>
          {entry.detail ? (
            <span className="min-w-0 break-words text-xs leading-5 tabular-nums text-muted-foreground">
              {entry.detail}
            </span>
          ) : null}
        </span>
      </span>
    </li>
  )
}

export function CareTimeline({
  timeline,
  isEnglish,
}: {
  timeline: CareTimelineModel
  isEnglish: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const regionId = useId()
  const lvefCount = timeline.entries.filter((entry) => entry.kind === 'lvef').length
  const summary = [
    lvefCount > 0
      ? (isEnglish ? `${lvefCount} LVEF reading${lvefCount === 1 ? '' : 's'}` : `${lvefCount} 筆 LVEF`)
      : undefined,
    isEnglish
      ? `${timeline.entries.length} entries`
      : `${timeline.entries.length} 筆紀錄`,
  ].filter(Boolean).join(' · ')

  return (
    <section
      className="overflow-hidden rounded-lg border border-border bg-card"
      aria-label={isEnglish ? 'Care timeline' : '照護時間軸'}
      data-testid="cdss-hf-timeline"
    >
      <button
        type="button"
        className={cn(
          'flex min-h-11 w-full flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-left transition-colors',
          'hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        )}
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={() => setExpanded((open) => !open)}
        data-testid="cdss-hf-timeline-trigger"
      >
        <span className="text-sm font-semibold text-foreground">
          {isEnglish ? 'Care timeline' : '照護時間軸'}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {timeline.from} → {timeline.to}
        </span>
        <span className="text-xs text-muted-foreground">{summary}</span>
        <ChevronDown
          className={cn(
            'ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>
      {expanded ? (
        <div
          id={regionId}
          role="region"
          aria-label={isEnglish ? 'Care timeline' : '照護時間軸'}
          className="border-t border-border px-3 py-3"
          data-testid="cdss-hf-timeline-detail"
        >
          <ol className="min-w-0">
            {timeline.entries.map((entry) => (
              <TimelineRow key={entry.id} entry={entry} isEnglish={isEnglish} />
            ))}
          </ol>
          <p className="mt-2 border-t border-border/60 pt-2 text-[11px] leading-4 text-muted-foreground">
            {isEnglish
              ? 'Dates are the record\'s own. A prescription span is what was dispensed, not what was taken.'
              : '日期皆為紀錄原值。處方區間是領藥紀錄，不等於實際服用期間。'}
          </p>
        </div>
      ) : null}
    </section>
  )
}
