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
import { MapFold } from './MapFold'

/**
 * Where each AF question group lives on the map: the decision point it feeds,
 * the first of the listed ones the model carries, else the foot of the given
 * column under 「其他問答」. Placement only — the groups and their questions are
 * the AF flow's own.
 */
const GROUP_HOMES: readonly { group: string; dps: readonly string[]; block: VisitBlock }[] = [
  { group: 'screening', dps: ['DP-04', 'DP-05', 'DP-06'], block: 'status' },
  { group: 'safety', dps: ['DP-08', 'DP-07'], block: 'treatment' },
  { group: 'stroke', dps: ['DP-07', 'DP-08'], block: 'treatment' },
  { group: 'antithrombotic', dps: ['DP-07', 'DP-08'], block: 'treatment' },
  { group: 'bleedingRisk', dps: ['DP-13'], block: 'treatment' },
  { group: 'comorbidity', dps: ['DP-21'], block: 'treatment' },
]

/** DP-03's groups: asked under the every-visit asks. */
const ASKS_GROUPS = ['followup', 'bleeding', 'adverse'] as const

/**
 * Groups a decision point asks with its own buttons, so they are not drawn a
 * second time: 「AF／flutter 診斷」 is DP-01's 「AF／AFL／都有」.
 */
const ASKED_BY_POINTS = ['diagnosis'] as const

/**
 * 01's cells under 診斷: the diagnosis, the evidence and screening behind it,
 * and the baseline work-up — the HF page's split, so both pages open the same
 * way (診斷 before a diagnosis and at the system's first visit, 追蹤 after).
 */
const DIAGNOSIS_VIEW_DPS = ['DP-01', 'DP-04', 'DP-05', 'DP-06'] as const

/** The rate-or-rhythm choice and the groups each strategy opens. */
const STRATEGY_DPS = ['DP-17', 'DP-18'] as const
const STRATEGY_GROUPS: Record<AfControlStrategy, string> = { rate: 'rate', rhythm: 'nhi' }

/**
 * The AF page's input surfaces for the decision map: the clinic measurements
 * form, the record's AF inputs, every AF structured question group, and the
 * rate-or-rhythm choice — the components the AF visit flow draws, over the same
 * answers, each placed on the point it feeds. A group with no point to live
 * under goes to its column's 「其他問答」; none is dropped, and the one DP-01
 * asks with its own buttons (the diagnosis) is not drawn twice. 01 has the
 * HF page's 診斷／追蹤 switch.
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
  const placed = new Set<string>([...ASKS_GROUPS, ...ASKED_BY_POINTS, ...homes.filter((home) => home.dp).map((home) => home.group)])
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
      <MapFold label={isEnglish ? 'Other questions' : '其他問答'} testId={`cdss-visit-other-questions-${block}`}>
        {strategyHere ? strategyContent : null}
        {ids.length ? groups(ids) : null}
      </MapFold>
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
    // DP-01 asks the diagnosis itself, as a row of 診斷決定: the view needs
    // no content of its own.
    diagnosis: { content: null, dps: DIAGNOSIS_VIEW_DPS },
    pointExtras: (point, options) => {
      const here = homes.filter((home) => home.dp && isPagePoint(point, 'af', [home.dp])).map((home) => home.group)
      // One card opens at a time on the map, so each strategy point's card
      // carries the choice; a page that shows every point at once shows it
      // under the first of them only.
      const strategyHere = strategyDp !== undefined && isPagePoint(point, 'af', options?.once ? [strategyDp] : STRATEGY_DPS)
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
          <MapFold label={isEnglish ? 'From the record and this visit' : '病歷與本次量測'} bodyClassName="@container" testId="cdss-visit-af-record">
            <AfRecordMetrics board={board} isEnglish={isEnglish} />
          </MapFold>
          {otherQuestions('status')}
        </>
      ),
      treatment: otherQuestions('treatment'),
    },
  }
  return <>{children(surfaces)}</>
}
