"use client"

// Narrow layout only: four tiles that are both the section counters and the
// jump targets. Their numbers come from the same OverviewData object the cards
// render, so a tile can never disagree with the header beneath it.
import type { LucideIcon } from 'lucide-react'
import { Calendar, FlaskConical, Pill, ScanLine } from 'lucide-react'
import { useLanguage } from '@/src/application/providers/language.provider'
import { cn } from '@/src/shared/utils/cn.utils'
import type { OverviewData } from '../hooks/useOverviewData'
import type { OverviewSectionId } from '../overview.types'
import {
  OVERVIEW_ATTENTION_PILL_CLASS,
  OVERVIEW_CHANGE_PILL_CLASS,
  OVERVIEW_INPATIENT_PILL_CLASS,
} from './overview-styles'

interface TileModel {
  id: OverviewSectionId
  icon: LucideIcon
  label: string
  value: number
  unit: string
  pills: { key: string; text: string; className: string; title?: string }[]
}

export function OverviewNavTiles({
  data,
  onJump,
}: {
  data: OverviewData
  onJump: (section: OverviewSectionId) => void
}) {
  const { t } = useLanguage()
  const strings = t.overview

  const tiles: TileModel[] = [
    {
      id: 'labs',
      icon: FlaskConical,
      label: strings.sections.labs,
      value: data.labs.resultCount,
      unit: strings.units.labs,
      pills: data.labs.abnormalCount > 0
        ? [{
          key: 'abnormal',
          text: strings.tiles.abnormal.replace('{count}', String(data.labs.abnormalCount)),
          className: OVERVIEW_ATTENTION_PILL_CLASS,
          title: strings.tiles.abnormalTitle,
        }]
        : [],
    },
    {
      id: 'reports',
      icon: ScanLine,
      label: strings.sections.reports,
      value: data.reports.count,
      unit: strings.units.reports,
      pills: [],
    },
    {
      id: 'meds',
      icon: Pill,
      label: strings.sections.meds,
      value: data.meds.count,
      unit: strings.units.meds,
      pills: data.meds.changeCount > 0
        ? [{
          key: 'changed',
          text: strings.tiles.changed.replace('{count}', String(data.meds.changeCount)),
          className: OVERVIEW_CHANGE_PILL_CLASS,
        }]
        : [],
    },
    {
      id: 'visits',
      icon: Calendar,
      label: strings.sections.visits,
      value: data.visits.count,
      unit: strings.units.visits,
      pills: [
        ...(data.visits.emergencyCount > 0
          ? [{
            key: 'emergency',
            text: strings.tiles.emergency.replace('{count}', String(data.visits.emergencyCount)),
            className: OVERVIEW_ATTENTION_PILL_CLASS,
          }]
          : []),
        ...(data.visits.inpatientCount > 0
          ? [{
            key: 'inpatient',
            text: strings.tiles.inpatient.replace('{count}', String(data.visits.inpatientCount)),
            className: OVERVIEW_INPATIENT_PILL_CLASS,
          }]
          : []),
      ],
    },
  ]

  return (
    <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
      {tiles.map((tile) => {
        const Icon = tile.icon
        return (
          <button
            key={tile.id}
            type="button"
            data-overview-tile={tile.id}
            title={strings.tiles.jumpTo.replace('{section}', tile.label)}
            onClick={() => onJump(tile.id)}
            className={cn(
              'flex min-w-0 cursor-pointer flex-col gap-1 rounded-lg border border-border bg-card px-2.5 py-2 text-left transition-colors',
              'hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
            )}
          >
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate text-[0.8125rem] font-semibold text-foreground">
                {tile.label}
              </span>
            </span>
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="flex items-baseline gap-0.5">
                <span className="text-xl font-bold leading-none tabular-nums text-foreground">
                  {tile.value}
                </span>
                <span className="text-xs text-muted-foreground">{tile.unit}</span>
              </span>
              {tile.pills.map((pill) => (
                <span key={pill.key} title={pill.title} className={cn(pill.className, 'h-5 text-[0.6875rem]')}>
                  {pill.text}
                </span>
              ))}
            </span>
          </button>
        )
      })}
    </div>
  )
}
