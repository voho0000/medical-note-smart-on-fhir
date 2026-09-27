"use client"

import { useId, useState, type ReactNode } from 'react'
import type { CdssResult } from '../../types'
import type { AfAnswers } from '../../stores/af-answers.store'
import type { ClinicVitals, ClinicVitalsPatch } from '../../stores/clinic-vitals.store'
import {
  AF_QUESTION_GROUP_IDS,
  AfControlStrategyPicker,
  AfQuestionGroups,
  AfRecordMetrics,
  type AfControlStrategy,
} from '../AtrialFibrillationVisitFlow'
import { ClinicVitalsForm } from '../ClinicVitalsForm'
import type { DiseaseBoardModel } from '../disease-board'
import type { VisitBlock, VisitDecisionModel } from '../../types'
import { firstPresentPoint, isPagePoint, type VisitMapSurfaces } from './visit-surfaces'

/**
 * Where each AF question group lives on the map: the decision point it feeds,
 * the first of the listed ones the model carries, else the foot of the given
 * column under 「其他問答」. Placement only — the groups and their questions are
 * the AF flow's own.
 */
const GROUP_HOMES: readonly { group: string; dps: readonly string[]; block: VisitBlock }[] = [
  { group: 'diagnosis', dps: ['DP-01', 'DP-00'], block: 'status' },
  { group: 'screening', dps: ['DP-04', 'DP-05', 'DP-06'], block: 'status' },
  { group: 'safety', dps: ['DP-08', 'DP-07'], block: 'treatment' },
  { group: 'stroke', dps: ['DP-07', 'DP-08'], block: 'treatment' },
  { group: 'antithrombotic', dps: ['DP-07', 'DP-08'], block: 'treatment' },
  { group: 'bleedingRisk', dps: ['DP-13'], block: 'treatment' },
  { group: 'comorbidity', dps: ['DP-21'], block: 'treatment' },
]

/** DP-03's groups: asked under the every-visit asks. */
const ASKS_GROUPS = ['followup', 'bleeding', 'adverse'] as const

/** The rate-or-rhythm choice and the groups each strategy opens. */
const STRATEGY_DPS = ['DP-17', 'DP-18'] as const
const STRATEGY_GROUPS: Record<AfControlStrategy, string> = { rate: 'rate', rhythm: 'nhi' }

/**
 * The AF page's input surfaces for the decision map: the clinic measurements
 * form, the record's AF inputs, every AF structured question group, and the
 * rate-or-rhythm choice — the components the AF visit flow draws, over the same
 * answers, each placed on the point it feeds. A group with no point to live
 * under goes to its column's 「其他問答」; none is dropped.
 */
export function AtrialFibrillationMapSurfaces({
  model,
  board,
  result,
  isEnglish,
  now,
  answers,
  onAnswer,
  clinicVitals,
  onSaveClinicVitals,
  onClearClinicVitals,
  children,
}: {
  model: VisitDecisionModel
  board: DiseaseBoardModel
  result: CdssResult
  isEnglish: boolean
  now: Date
  answers?: AfAnswers
  onAnswer?: (id: string, value: boolean | undefined) => void
  clinicVitals?: ClinicVitals
  onSaveClinicVitals?: (patch: ClinicVitalsPatch) => void
  onClearClinicVitals?: () => void
  children: (surfaces: VisitMapSurfaces) => ReactNode
}) {
  const strategyName = useId()
  const [vitalsOpen, setVitalsOpen] = useState(false)
  const [strategy, setStrategy] = useState<AfControlStrategy | null>(null)
  const groups = (groupIds: readonly string[]) => (
    <AfQuestionGroups
      groupIds={groupIds}
      board={board}
      result={result}
      isEnglish={isEnglish}
      answers={answers}
      onAnswer={onAnswer}
    />
  )

  const homes = GROUP_HOMES.map((home) => ({ ...home, dp: firstPresentPoint(model.points, 'af', home.dps) }))
  const strategyDp = firstPresentPoint(model.points, 'af', STRATEGY_DPS)
  const placed = new Set<string>([...ASKS_GROUPS, ...homes.filter((home) => home.dp).map((home) => home.group)])
  if (strategyDp) Object.values(STRATEGY_GROUPS).forEach((group) => placed.add(group))

  const strategyContent = (
    <div data-testid="cdss-visit-af-strategy">
      <AfControlStrategyPicker value={strategy} onChange={setStrategy} isEnglish={isEnglish} name={strategyName} />
      {strategy ? groups([STRATEGY_GROUPS[strategy]]) : null}
    </div>
  )

  // What found no point: by column, under 「其他問答」. Groups the model does
  // not place are still the AF flow's groups, and a question nobody can reach
  // is a question dropped.
  const homeless = (block: VisitBlock) => AF_QUESTION_GROUP_IDS.filter((group) => {
    if (placed.has(group)) return false
    const home = GROUP_HOMES.find((candidate) => candidate.group === group)
    return (home?.block ?? 'treatment') === block
  })
  const otherQuestions = (block: VisitBlock): ReactNode => {
    const ids = homeless(block)
    const strategyHere = !strategyDp && block === 'treatment'
    if (ids.length === 0 && !strategyHere) return null
    return (
      <details className="rounded-md border border-border bg-background" data-testid={`cdss-visit-other-questions-${block}`}>
        <summary className="flex min-h-11 cursor-pointer items-center px-2.5 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          {isEnglish ? 'Other questions' : '其他問答'}
        </summary>
        <div className="border-t border-border">
          {strategyHere ? strategyContent : null}
          {ids.length ? groups(ids) : null}
        </div>
      </details>
    )
  }

  const surfaces: VisitMapSurfaces = {
    ...(onSaveClinicVitals ? {
      editValues: () => setVitalsOpen(true),
      editValue: () => setVitalsOpen(true),
    } : {}),
    statusPanel: vitalsOpen && onSaveClinicVitals ? (
      <div className="rounded-md border border-border p-3" data-testid="cdss-visit-af-clinic-vitals">
        <ClinicVitalsForm
          isEnglish={isEnglish}
          now={now}
          initial={clinicVitals}
          onSave={onSaveClinicVitals}
          onClear={onClearClinicVitals}
          onClose={() => setVitalsOpen(false)}
        />
      </div>
    ) : undefined,
    asksDetail: {
      label: isEnglish ? 'Other symptoms, bleeding and adverse effects' : '其他症狀、出血與副作用',
      content: groups(ASKS_GROUPS),
    },
    pointExtras: (point) => {
      const here = homes.filter((home) => home.dp && isPagePoint(point, 'af', [home.dp])).map((home) => home.group)
      const strategyHere = strategyDp !== undefined && isPagePoint(point, 'af', STRATEGY_DPS)
      if (here.length === 0 && !strategyHere) return undefined
      return (
        <>
          {here.length ? groups(here) : null}
          {strategyHere ? strategyContent : null}
        </>
      )
    },
    columnFooters: {
      status: (
        <>
          <details className="rounded-md border border-border bg-background" data-testid="cdss-visit-af-record">
            <summary className="flex min-h-11 cursor-pointer items-center px-2.5 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              {isEnglish ? 'From the record and this visit' : '病歷與本次量測'}
            </summary>
            <div className="@container border-t border-border">
              <AfRecordMetrics board={board} isEnglish={isEnglish} />
            </div>
          </details>
          {otherQuestions('status')}
        </>
      ),
      treatment: otherQuestions('treatment'),
    },
  }
  return <>{children(surfaces)}</>
}
