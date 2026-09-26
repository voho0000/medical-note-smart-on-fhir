"use client"

import { type ReactNode, useMemo, useState } from 'react'
import { ChevronDown, CircleDashed } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/src/shared/utils/cn.utils'
import type { CdssRecommendation, CdssResult } from '../types'
import {
  buildDecisionMap,
  decisionMapStateLabel,
  HF_DECISION_MAP_GROUPS,
  type DecisionMapCell,
  type DecisionMapGroupDef,
  type DecisionMapState,
} from './heart-failure-decision-map'
import type { VisitActionRow } from './heart-failure-visit-flow'
import { statusLabel, statusStyle, StatusIcon } from './status-presentation'

const ABSENT_STYLE = 'bg-muted text-muted-foreground hover:bg-muted'

function StateBadge({ state, isEnglish }: { state: DecisionMapState; isEnglish: boolean }) {
  const absent = state === 'not-applicable' || state === 'not-included'
  return (
    <Badge
      className={cn(
        'h-auto min-h-5 max-w-full whitespace-normal px-1.5 py-0.5 text-left text-xs font-medium leading-tight',
        absent ? ABSENT_STYLE : statusStyle[state],
      )}
    >
      {absent
        ? <CircleDashed className="mr-1 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        : <StatusIcon status={state} />}
      {decisionMapStateLabel(state, isEnglish)}
    </Badge>
  )
}

export interface DecisionMapCardProps {
  result: CdssResult
  isEnglish: boolean
  /** The same decision detail every other surface opens. */
  renderDetail: (recommendation: CdssRecommendation) => ReactNode
  /** The visit flow's rows, by module id; absent where the layout records no decisions. */
  actionRows?: ReadonlyMap<string, VisitActionRow>
  /** The flow's own decision controls for a row. */
  renderDecision?: (row: VisitActionRow) => ReactNode
  groups?: readonly DecisionMapGroupDef[]
}

/**
 * 「決策地圖」: the HF specification's decision points on one folded grid.
 *
 * Folded by default, so the page reads as before until the clinician asks for
 * the overview. A point opens, under its own group, the full card of every
 * module behind it — the same detail and the same decision buttons as the list
 * — and closes on a second press. Placement only: the state is the pack's
 * status, the text under a point is the pack's own next step.
 */
export function DecisionMapCard({
  result,
  isEnglish,
  renderDetail,
  actionRows,
  renderDecision,
  groups = HF_DECISION_MAP_GROUPS,
}: DecisionMapCardProps) {
  const map = useMemo(() => buildDecisionMap(result, groups), [groups, result])
  const [expanded, setExpanded] = useState(false)
  const [openPoint, setOpenPoint] = useState<string | null>(null)
  const summary = isEnglish
    ? `${map.total} decision points · ${map.counts.actionable} action needed · ${map.counts['needs-data']} data needed · ${map.counts.review} to review`
    : `${map.total} 個決策點 · 需處理 ${map.counts.actionable} · 需補資料 ${map.counts['needs-data']} · 需確認 ${map.counts.review}`

  return (
    <details open={expanded} className="group rounded-lg border border-border bg-card" data-testid="cdss-hf-decision-map">
      <summary
        onClick={(event) => {
          // The grid is drawn only while open, so the fold is driven from here.
          event.preventDefault()
          setExpanded((current) => !current)
        }}
        aria-expanded={expanded}
        className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        data-testid="cdss-hf-decision-map-toggle"
      >
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-foreground">{isEnglish ? 'Decision map' : '決策地圖'}</h3>
        <span className="text-xs tabular-nums text-muted-foreground" data-testid="cdss-hf-decision-map-summary">
          {summary}
        </span>
      </summary>
      {expanded ? <div className="space-y-3 border-t border-border px-3 py-3">
        {map.groups.map((group) => {
          const headingId = `cdss-hf-map-group-${group.def.id}`
          const openCell = group.cells.find((cell) => cell.point.dp === openPoint)
          return (
            <section key={group.def.id} aria-labelledby={headingId} data-testid={`cdss-hf-map-group-${group.def.id}`}>
              <h4 id={headingId} className="text-xs font-semibold text-muted-foreground">
                <span aria-hidden="true">{group.def.marker} </span>
                {isEnglish ? group.def.label.en : group.def.label.zh}
              </h4>
              <ul className="mt-1.5 grid grid-cols-2 gap-1.5 @min-[40rem]:grid-cols-3 @min-[56rem]:grid-cols-4">
                {group.cells.map((cell) => (
                  <MapCell
                    key={cell.point.dp}
                    cell={cell}
                    isEnglish={isEnglish}
                    open={openPoint === cell.point.dp}
                    onToggle={() => setOpenPoint((current) => (current === cell.point.dp ? null : cell.point.dp))}
                  />
                ))}
              </ul>
              {openCell ? (
                <MapRegion
                  cell={openCell}
                  isEnglish={isEnglish}
                  renderDetail={renderDetail}
                  actionRows={actionRows}
                  renderDecision={renderDecision}
                />
              ) : null}
            </section>
          )
        })}
      </div> : null}
    </details>
  )
}

function MapCell({
  cell,
  isEnglish,
  open,
  onToggle,
}: {
  cell: DecisionMapCell
  isEnglish: boolean
  open: boolean
  onToggle: () => void
}) {
  const name = isEnglish ? cell.point.label.en : cell.point.label.zh
  return (
    <li className="min-w-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? `cdss-hf-map-region-${cell.point.dp}` : undefined}
        title={cell.hint}
        onClick={onToggle}
        data-testid={`cdss-hf-map-cell-${cell.point.dp}`}
        data-state={cell.state}
        className={cn(
          'flex h-full min-h-11 w-full min-w-0 flex-col items-start gap-1 rounded-md border px-2 py-1.5 text-left transition-colors @min-[40rem]:min-h-8',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          open ? 'border-primary bg-primary/5' : 'border-border bg-background hover:bg-muted/40',
        )}
      >
        <span className="flex w-full min-w-0 flex-wrap items-baseline gap-x-1.5">
          <span className="text-xs tabular-nums text-muted-foreground">{cell.point.dp}</span>
          <span className="min-w-0 break-words text-sm font-medium leading-snug text-foreground">{name}</span>
        </span>
        <StateBadge state={cell.state} isEnglish={isEnglish} />
        {cell.hint ? (
          <span className="block w-full truncate text-xs leading-snug text-muted-foreground">{cell.hint}</span>
        ) : null}
      </button>
    </li>
  )
}

function MapRegion({
  cell,
  isEnglish,
  renderDetail,
  actionRows,
  renderDecision,
}: {
  cell: DecisionMapCell
  isEnglish: boolean
  renderDetail: (recommendation: CdssRecommendation) => ReactNode
  actionRows?: ReadonlyMap<string, VisitActionRow>
  renderDecision?: (row: VisitActionRow) => ReactNode
}) {
  const name = isEnglish ? cell.point.label.en : cell.point.label.zh
  return (
    <div
      role="region"
      id={`cdss-hf-map-region-${cell.point.dp}`}
      aria-label={`${cell.point.dp} ${name}`}
      className="mt-2 space-y-2 rounded-md border border-border bg-muted/20 p-2"
      data-testid={`cdss-hf-map-region-${cell.point.dp}`}
    >
      {cell.recommendations.length === 0 ? (
        <p className="px-1 py-1 text-sm text-muted-foreground">
          {cell.state === 'not-included'
            ? (isEnglish ? 'No module covers this decision point yet.' : '此決策點尚未有對應模組。')
            : (isEnglish
              ? 'The guidance wrote no module for this decision point for this patient.'
              : '本次結果沒有此決策點的模組（不適用或尚未納入）。')}
        </p>
      ) : cell.recommendations.map((recommendation) => {
        const row = actionRows?.get(recommendation.id)
        const shown = row?.recommendation ?? recommendation
        return (
          <article
            key={recommendation.id}
            className="rounded-md border border-border bg-background"
            data-testid={`cdss-hf-map-module-${recommendation.id}`}
          >
            <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-3 py-2">
              <Badge className={cn('h-5 shrink-0 px-1.5 text-xs', statusStyle[shown.status])}>
                <StatusIcon status={shown.status} />
                {statusLabel(shown.status, isEnglish)}
              </Badge>
              <span className="min-w-0 break-words text-sm font-semibold text-foreground">
                {row?.moduleName ?? shown.moduleName ?? shown.title}
              </span>
            </header>
            {row && renderDecision ? <div className="px-3 pb-2">{renderDecision(row)}</div> : null}
            <div>{renderDetail(shown)}</div>
          </article>
        )
      })}
    </div>
  )
}
