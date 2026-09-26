/**
 * 「決策地圖」: every decision point of the HF specification on one grid, each
 * showing where this patient stands on it.
 *
 * The points and their six groups are the clinical specification's own list
 * (HF CDSS clinical spec 2026-09-25 §4: 36 decision points plus DP-03, which
 * is visit data rather than a decision). Which pack modules speak for each
 * point is the code-gap tracker's map (same date, §1), plus the AF cards the
 * host merges onto the HF page. The short names are the host's navigation
 * labels — abbreviations of the specification's decision-point names — and
 * say nothing clinical.
 *
 * A point's state is read off the statuses its modules already carry, in the
 * order the rest of the page ranks them: any module the pack marked
 * actionable makes the point 「需處理」, otherwise data needed, otherwise
 * review, and only when every module present is 「目前無需處理」 does the point
 * read as settled. A point whose modules the pack did not write this time is
 * 「不適用或尚未納入」; a point no module covers yet is 「尚未納入」. No
 * threshold, no number read into a judgement, no status the pack did not set.
 *
 * Pure and React-free, like the visit-flow model, so the combination rules are
 * tested without mounting anything.
 */
import type { CdssRecommendation, CdssResult, CdssStatus } from '../types'
import { applyHeartFailureMedicationSafety } from './heart-failure-medication-safety'

export interface DecisionMapPointDef {
  /** 「DP-14」: the specification's display number. */
  dp: string
  /** 「hf-af-anticoagulation」: the specification's semantic id. */
  semanticId: string
  /** Short host navigation label. */
  label: { zh: string; en: string }
  /** The pack modules that speak for this point (code-gap tracker §1). */
  moduleIds: readonly string[]
  /** The tracker lists no module for this point yet. */
  notYetIncluded?: boolean
  /** DP-03: visit data, shown on the grid but not counted as a decision. */
  notDecision?: boolean
}

export interface DecisionMapGroupDef {
  id: string
  marker: string
  label: { zh: string; en: string }
  points: readonly DecisionMapPointDef[]
}

const point = (
  dp: string,
  semanticId: string,
  zh: string,
  en: string,
  moduleIds: readonly string[],
  extra: Pick<DecisionMapPointDef, 'notDecision'> = {},
): DecisionMapPointDef => ({
  dp,
  semanticId,
  label: { zh, en },
  moduleIds,
  ...(moduleIds.length === 0 ? { notYetIncluded: true } : {}),
  ...extra,
})

/** The six groups of the HF specification §4, in its order. */
export const HF_DECISION_MAP_GROUPS: readonly DecisionMapGroupDef[] = [
  {
    id: 'gate',
    marker: '⓪',
    label: { zh: '閘門與共用層', en: 'Gates and shared layer' },
    points: [
      point('DP-24', 'hf-triage', '今日分流', 'Same-day triage', ['heart-failure-monitoring']),
      point('DP-25', 'hf-med-reconciliation', '用藥核對', 'Medication reconciliation', []),
      point('DP-03', 'hf-visit-response', '每次反應資料', 'Visit response data', [], { notDecision: true }),
      point('DP-11', 'hf-safety-exception', '安全例外', 'Safety exceptions', [
        'heart-failure-fmt-safety',
        'heart-failure-mra-safety',
      ]),
      point('DP-17', 'hf-monitoring-schedule', '監測排程', 'Monitoring schedule', ['heart-failure-monitoring']),
      point('DP-18', 'hf-follow-up-interval', '回診間隔', 'Follow-up interval', []),
    ],
  },
  {
    id: 'diagnosis',
    marker: '①',
    label: { zh: '診斷與重新評估', en: 'Diagnosis and reassessment' },
    points: [
      point('DP-00', 'hf-suspicion', '是否懷疑 HF', 'HF suspicion', ['heart-failure-phenotype']),
      point('DP-01', 'hf-diagnosis-phenotype', '確診與分型', 'Diagnosis and phenotype', ['heart-failure-phenotype']),
      point('DP-34', 'hf-pef-confirmation', 'HFpEF 證實', 'HFpEF confirmation', ['heart-failure-hfpef-diagnosis']),
      point('DP-02', 'hf-baseline-workup', '基線評估', 'Baseline work-up', []),
      point('DP-04', 'hf-reassessment', '重新評估', 'Reassessment', []),
      point('DP-29', 'hf-etiology', '病因', 'Aetiology', []),
      point('DP-30', 'hf-ischemia-valve', '缺血與瓣膜', 'Ischaemia and valves', []),
    ],
  },
  {
    id: 'pillars',
    marker: '②',
    label: { zh: '四支柱', en: 'Four pillars' },
    points: [
      point('DP-07', 'hf-ras', 'RAS 抑制', 'RAS inhibition', ['heart-failure-ras-inhibition']),
      point('DP-08', 'hf-beta-blocker', 'β 阻斷劑', 'Beta-blocker', ['heart-failure-beta-blocker']),
      point('DP-09', 'hf-mra', 'MRA', 'MRA', ['heart-failure-mra']),
      point('DP-10', 'hf-sglt2i', 'SGLT2i', 'SGLT2i', ['heart-failure-sglt2']),
    ],
  },
  {
    id: 'congestion',
    marker: '③',
    label: { zh: '鬱血、有害藥物、暫停與改善後', en: 'Congestion, harmful drugs, holds and improved EF' },
    points: [
      point('DP-05', 'hf-harmful-drugs', '有害藥物', 'Harmful drugs', ['heart-failure-medication-safety']),
      point('DP-06', 'hf-congestion-diuretic', '鬱血與利尿劑', 'Congestion and diuretics', [
        'heart-failure-congestion-diuretic',
        'heart-failure-congestion-response',
      ]),
      point('DP-26', 'hf-hold-restart', '暫停與重啟', 'Hold and restart', []),
      point('DP-27', 'hf-improved-ef', 'LVEF 改善後', 'Improved LVEF', ['heart-failure-hfimpEF-therapy']),
    ],
  },
  {
    id: 'beyond-fmt',
    marker: '④',
    label: { zh: 'FMT 到位仍不夠', en: 'Beyond foundational therapy' },
    points: [
      point('DP-13', 'hf-additional-therapy', '其他藥物', 'Additional therapy', ['heart-failure-additional-medical-therapy']),
      point('DP-12', 'hf-iron-anaemia', '缺鐵與貧血', 'Iron and anaemia', []),
      point('DP-16', 'hf-device-candidacy', '裝置候選', 'Device candidacy', []),
      point('DP-36', 'hf-device-follow-up', '既有裝置追蹤', 'Device follow-up', []),
      point('DP-19', 'hf-advanced-referral', '進階 HF 轉介', 'Advanced HF referral', []),
      point('DP-33', 'hf-goals-of-care', '照護目標', 'Goals of care', []),
    ],
  },
  {
    id: 'whole-person',
    marker: '⑤',
    label: { zh: '全人照護', en: 'Whole-person care' },
    points: [
      point('DP-15', 'hf-cardiac-rehab', '心臟復健', 'Cardiac rehabilitation', [
        'cardiac-rehabilitation',
        'cardiac-rehabilitation-safety',
        'cardiac-rehabilitation-response',
      ]),
      point('DP-31', 'hf-comorbidity', '共病協調', 'Comorbidities', []),
      point('DP-32', 'hf-self-care', '自我照護與疫苗', 'Self-care and vaccines', []),
      point('DP-35', 'hf-special-population', '特殊族群', 'Special populations', []),
    ],
  },
  {
    id: 'af-shared',
    marker: '⑥',
    label: { zh: 'AF 與共用模組', en: 'AF and shared modules' },
    points: [
      point('DP-14', 'hf-af-anticoagulation', 'AF 抗凝', 'AF anticoagulation', [
        'af-documented-cha2ds2-vasc',
        'af-anticoagulation-concordance',
        'af-anticoagulant-selection-safety',
        'af-doac-renal-dose-check',
        'af-anticoagulation-monitoring',
        'af-drug-interactions',
        'af-bleeding-complications',
        'af-warfarin-ttr',
      ]),
      point('DP-28', 'hf-af-rate-rhythm', 'AF 心率與節律', 'AF rate and rhythm', ['af-rate-control-and-lvef-safety']),
      point('DP-20', 'hf-lipid', '降脂', 'Lipid lowering', ['ascvd-lipid-therapy']),
      point('DP-21', 'hf-vte', 'VTE 抗凝', 'VTE anticoagulation', ['vte-anticoagulation-strategy']),
      point('DP-22', 'hf-acs-pci-antiplatelet', 'ACS／PCI 抗血小板', 'ACS/PCI antiplatelet', ['cad-dapt-strategy']),
      point('DP-23', 'hf-antithrombotic-coordination', '多重抗栓整合', 'Antithrombotic coordination', ['antithrombotic-coordination']),
    ],
  },
]

/** A pack status, or one of the two states where no module speaks. */
export type DecisionMapState = CdssStatus | 'not-applicable' | 'not-included'

export interface DecisionMapCell {
  point: DecisionMapPointDef
  state: DecisionMapState
  /** The modules present in this result, in the point's own module order. */
  recommendations: readonly CdssRecommendation[]
  /** The pack's first next step on the module that set the state. */
  hint?: string
}

export interface DecisionMapGroup {
  def: DecisionMapGroupDef
  cells: readonly DecisionMapCell[]
}

export interface DecisionMapModel {
  groups: readonly DecisionMapGroup[]
  /** Decision points on the map, DP-03 not counted. */
  total: number
  counts: Readonly<Record<DecisionMapState, number>>
}

const STATE_ORDER: readonly CdssStatus[] = ['actionable', 'needs-data', 'review', 'no-action']

/** The labels the map prints; host wording for where a point stands, not clinical text. */
export function decisionMapStateLabel(state: DecisionMapState, isEnglish: boolean): string {
  switch (state) {
    case 'actionable': return isEnglish ? 'Action needed' : '需處理'
    case 'needs-data': return isEnglish ? 'Data needed' : '需補資料'
    case 'review': return isEnglish ? 'Needs review' : '需確認'
    case 'no-action': return isEnglish ? 'Done / none needed' : '已處理／無需處理'
    case 'not-applicable': return isEnglish ? 'Not applicable or not yet covered' : '不適用或尚未納入'
    case 'not-included': return isEnglish ? 'Not yet covered' : '尚未納入'
  }
}

/**
 * The map for one result. The recommendations are read the way the visit flow
 * reads them (automated checks' cards included, the host's medication-safety
 * reading applied), so a point never disagrees with the row it opens.
 */
export function buildDecisionMap(
  result: CdssResult,
  groups: readonly DecisionMapGroupDef[] = HF_DECISION_MAP_GROUPS,
): DecisionMapModel {
  const recommendations = [
    ...result.recommendations,
    ...(result.automatedChecks ?? [])
      .map((check) => check.recommendation)
      .filter((item): item is CdssRecommendation => Boolean(item)),
  ].map(applyHeartFailureMedicationSafety)
  const byId = new Map<string, CdssRecommendation>()
  for (const item of recommendations) if (!byId.has(item.id)) byId.set(item.id, item)

  const counts: Record<DecisionMapState, number> = {
    actionable: 0,
    'needs-data': 0,
    review: 0,
    'no-action': 0,
    'not-applicable': 0,
    'not-included': 0,
  }
  let total = 0

  const built = groups.map((def): DecisionMapGroup => ({
    def,
    cells: def.points.map((pointDef): DecisionMapCell => {
      const present = pointDef.moduleIds
        .map((id) => byId.get(id))
        .filter((item): item is CdssRecommendation => Boolean(item))
      const lead = STATE_ORDER
        .map((status) => present.find((item) => item.status === status))
        .find(Boolean)
      const state: DecisionMapState = lead
        ? lead.status
        : pointDef.notYetIncluded
          ? 'not-included'
          : 'not-applicable'
      if (!pointDef.notDecision) {
        total += 1
        counts[state] += 1
      }
      const hint = lead?.nextActions[0]?.trim()
      return {
        point: pointDef,
        state,
        recommendations: present,
        ...(hint ? { hint } : {}),
      }
    }),
  }))

  return { groups: built, total, counts }
}
