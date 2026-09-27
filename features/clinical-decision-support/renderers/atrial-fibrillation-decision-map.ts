/**
 * 「決策地圖」 for the AF page: every decision point of the AF clinical
 * specification (整合版 2026-09-26 §4: DP-00–DP-24, grouped as the gate, the
 * diagnosis, and AF-CARE's A, R, C and E) on the same folded grid the HF page
 * uses, each showing where this patient stands on it.
 *
 * Which pack modules speak for a point is the specification's crosswalk (02
 * §9). Three points have no rule of their own yet and read 「尚未納入」 rather
 * than borrowing a neighbour's state: DP-16 LAAO referral (its text sits on
 * the anticoagulation card, G-31), DP-22 event-driven reassessment (G-10) and
 * DP-24 follow-up scheduling (G-11). DP-03, the visit checklist, is data
 * rather than a decision and is not counted.
 *
 * Placement only: the state of a point is the status its modules already
 * carry, combined by the shared `buildDecisionMap` rules.
 */
import type { DecisionMapGroupDef, DecisionMapPointDef } from './heart-failure-decision-map'

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

export const AF_DECISION_MAP_GROUPS: readonly DecisionMapGroupDef[] = [
  {
    id: 'af-gate',
    marker: '⓪',
    label: { zh: '閘門與共用層', en: 'Gates and shared layer' },
    points: [
      point('DP-00', 'af.triage', '今日分流（急症／出血）', 'Same-day triage', [
        'af-bleeding-complications',
        'af-followup-assessment',
      ]),
      point('DP-01', 'af.status', '診斷評估或追蹤', 'Diagnostic work-up or follow-up', ['af-diagnosis-and-pattern']),
      point('DP-02', 'af.med-reconciliation', '實際用藥核對', 'Medication reconciliation', [
        'af-followup-assessment',
        'af-drug-interactions',
      ]),
      point('DP-03', 'af.visit-check', '每次追蹤清單', 'Visit checklist', ['af-followup-assessment'], {
        notDecision: true,
      }),
    ],
  },
  {
    id: 'af-diagnosis',
    marker: '①',
    label: { zh: '診斷與篩檢', en: 'Diagnosis and screening' },
    points: [
      point('DP-04', 'af.evidence-review', 'AF 證據確認（ECG）', 'Confirm AF evidence (ECG)', ['af-history']),
      point('DP-05', 'af.baseline-workup', '新診斷基線檢查', 'Baseline work-up', ['af-diagnosis-and-pattern']),
      point('DP-06', 'af.detection', '篩檢與心律監測', 'Screening and rhythm monitoring', [
        'af-esc-screening-pathway',
        'af-pac-screening',
        'af-comprehensive-screening',
        'af-detection-risk',
        'af-atrial-enlargement-screening',
        'af-osas-screening',
      ]),
    ],
  },
  {
    id: 'af-a',
    marker: 'A',
    label: { zh: '中風預防（抗凝）', en: 'Stroke prevention' },
    points: [
      point('DP-07', 'af.oac-indication', '需要抗凝嗎', 'Anticoagulation indication', [
        'af-anticoagulation-concordance',
        'af-documented-cha2ds2-vasc',
      ]),
      point('DP-08', 'af.oac-agent', 'DOAC 或 VKA（瓣膜）', 'DOAC or VKA (valves)', ['af-anticoagulant-selection-safety']),
      point('DP-09', 'af.doac-dose', 'DOAC 劑量（Table 11）', 'DOAC dose (Table 11)', ['af-doac-renal-dose-check']),
      point('DP-10', 'af.oac-ddi', '抗凝交互作用', 'Anticoagulant interactions', ['af-drug-interactions']),
      point('DP-11', 'af.vka-quality', 'Warfarin INR／TTR', 'Warfarin INR/TTR', [
        'af-warfarin-ttr',
        'af-anticoagulation-monitoring',
      ]),
      point('DP-12', 'af.antithrombotic-combo', '抗凝＋抗血小板', 'Anticoagulant plus antiplatelet', ['antithrombotic-coordination']),
      point('DP-13', 'af.bleeding-risk', '可修正出血因子', 'Modifiable bleeding risk', [
        'af-bleeding-risk-data-gaps',
        'af-has-bled',
      ]),
      point('DP-14', 'af.bleeding-event', '出血事件', 'Bleeding events', ['af-bleeding-complications']),
      point('DP-15', 'af.oac-bp', '抗凝期間血壓 <130/80', 'Blood pressure on anticoagulation', ['af-anticoagulation-bp']),
      point('DP-16', 'af.laao', '左心耳封堵轉介', 'LAAO referral', []),
    ],
  },
  {
    id: 'af-r',
    marker: 'R',
    label: { zh: '心率與節律', en: 'Rate and rhythm' },
    points: [
      point('DP-17', 'af.rate-control', '心率控制與 LVEF', 'Rate control and LVEF', ['af-rate-control-and-lvef-safety']),
      point('DP-18', 'af.rhythm-strategy', '節律控制／電燒轉介', 'Rhythm control / ablation', ['af-rhythm-control-and-ablation']),
      point('DP-19', 'af.aad-safety', '抗心律不整藥安全', 'Antiarrhythmic safety', [
        'af-antiarrhythmic-drug-safety',
        'af-dronedarone-nhi',
      ]),
      point('DP-20', 'af.amiodarone-monitoring', 'Amiodarone 監測', 'Amiodarone monitoring', ['af-amiodarone-monitoring']),
    ],
  },
  {
    id: 'af-c',
    marker: 'C',
    label: { zh: '共病與風險因子', en: 'Comorbidities and risk factors' },
    points: [
      point('DP-21', 'af.risk-factors', '可修正風險因子', 'Modifiable risk factors', ['af-comorbidity-risk-factors']),
    ],
  },
  {
    id: 'af-e',
    marker: 'E',
    label: { zh: '動態再評估', en: 'Dynamic reassessment' },
    points: [
      point('DP-22', 'af.reassessment', '條件改變重算', 'Reassess on change', []),
      point('DP-23', 'af.hf-signal', 'HF 發生／惡化訊號', 'Heart-failure signal', ['af-hf-prognosis']),
      point('DP-24', 'af.follow-up-plan', '回診與檢驗排程', 'Follow-up schedule', []),
    ],
  },
]

/**
 * The groups in the order this patient needs them. With AF confirmed the
 * diagnosis and screening group moves to the end and says it is for reference
 * (spec DP-06); otherwise it follows the gate, where the work is.
 */
export function afDecisionMapGroupsFor(followUp: boolean): readonly DecisionMapGroupDef[] {
  if (!followUp) return AF_DECISION_MAP_GROUPS
  const diagnosis = AF_DECISION_MAP_GROUPS.find((g) => g.id === 'af-diagnosis')!
  return [
    ...AF_DECISION_MAP_GROUPS.filter((g) => g.id !== 'af-diagnosis'),
    { ...diagnosis, label: { zh: '診斷與篩檢（已確診 AF：供回顧）', en: 'Diagnosis and screening (AF confirmed: for reference)' } },
  ]
}
