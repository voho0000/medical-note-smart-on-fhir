"use client"

import type { HeartFailureMapSurfaceSlots } from '../HeartFailureVisitFlow'
import type { VisitDecisionModel } from '../../types'
import type { VisitMapSurfaces } from './visit-surfaces'

/** 01's cells under 診斷: suspicion, diagnosis and phenotype, HFpEF, baseline work-up, reassessment, aetiology. */
const DIAGNOSIS_VIEW_DPS = ['DP-00', 'DP-01', 'DP-34', 'DP-02', 'DP-04', 'DP-29', 'DP-30'] as const

/** Whether the pack set RAS and β-blocker aside as not FMT here — HFpEF's pillars. */
function hfpefPillars(model: VisitDecisionModel): boolean {
  return ['DP-07', 'DP-08'].every((dp) => model.points.find((point) => point.dp === dp && point.source === 'hf')?.state === 'not-applicable')
}

/**
 * Where the heart-failure page's surfaces sit on the map:
 *
 * - the clinical-values editor behind 「補填／修改量測」 in the status line, and
 *   behind every stale or missing value there;
 * - 本次評估's follow-up half (symptoms, signs, NYHA, compensation) and the
 *   chief-complaint and weight follow-up under the two asks, as
 *   「其他症狀、徵象與 NYHA」;
 * - 01's 診斷 view: before a diagnosis the assessment (懷疑 HF？ first), then
 *   the diagnosis confirmation, the diagnostic questions and the HFpEF scores
 *   with their calculator, beside the diagnosis points' cells;
 * - the clinical values with their sources and echo report, the rhythm and the
 *   care timeline folded at 01's foot.
 */
export function heartFailureVisitSurfaces(
  slots: HeartFailureMapSurfaceSlots,
  model: VisitDecisionModel,
  isEnglish: boolean,
): VisitMapSurfaces {
  return {
    ...(slots.editValues ? { editValues: slots.editValues } : {}),
    ...(slots.editValue ? { editValue: slots.editValue } : {}),
    asksDetail: {
      // 「其他」 beside the two asks; before a diagnosis there are none, and
      // this is the diagnostic assessment itself, 懷疑 HF？ first.
      label: model.asks.length
        ? (isEnglish ? 'Other symptoms, signs and NYHA' : '其他症狀、徵象與 NYHA')
        : (isEnglish ? 'Diagnostic assessment' : '診斷評估'),
      openCount: slots.followUpOpenCount,
      pendingLabels: slots.followUpPendingLabels,
      requests: slots.followUpRequests,
      // The whole checklist belongs to a heart-failure first assessment.
      opensAtFirstAssessment: true,
      content: (
        <div className="space-y-2" data-testid="cdss-visit-hf-follow-up-questions">
          {slots.followUpQuestions}
          {slots.followUpPriorities}
        </div>
      ),
    },
    // 01's 診斷 view holds the whole diagnostic step: before a diagnosis the
    // assessment (懷疑 HF？ first, then symptoms, signs, NYHA), then the
    // confirmation, phenotype and HFpEF criteria with their scores, beside the
    // diagnosis points' cells — so none of it is repeated inside their cards.
    diagnosis: {
      content: (
        <div className="space-y-3" data-testid="cdss-visit-hf-diagnosis-view">
          {model.asks.length ? null : (
            <section className="space-y-1.5" aria-label={isEnglish ? 'Diagnostic assessment' : '診斷評估'}>
              <h4 className="px-0.5 text-[11px] font-semibold text-muted-foreground" data-map-heading="">{isEnglish ? 'Diagnostic assessment' : '診斷評估'}</h4>
              {slots.followUpQuestions}
            </section>
          )}
          {slots.diagnosticAssessment}
        </div>
      ),
      dps: DIAGNOSIS_VIEW_DPS,
      // 「HFrEF 還是 HFpEF？」 is DP-01 (DP-00 folded into it), and its
      // 「還不確定」 path ends at DP-34's confirmation, in the same card.
      answeredBy: { request: 'hf-suspicion', dps: ['DP-00', 'DP-01', 'DP-34'] },
    },
    // HFrEF's four pillars, always in view at the head of 02. In HFpEF the
    // RAS and β-blocker points are not FMT and step aside (the screen drops
    // a not-applicable pillar), leaving the two ESC 2026 p.35 names:
    // 「Foundational medical therapy for HFpEF includes SGLT2-Is and MRAs」.
    pillars: {
      title: hfpefPillars(model)
        ? (isEnglish ? 'HFpEF foundational therapy' : 'HFpEF 基礎藥物')
        : (isEnglish ? 'Four pillars' : '四支柱'),
      dps: ['DP-07', 'DP-08', 'DP-09', 'DP-10'],
      whenActive: ['DP-26'],
      // Decongestion prescribes too: right under the pillars, not among 02's other cells.
      followedBy: { title: isEnglish ? 'Diuretics' : '利尿劑', dps: ['DP-06'] },
    },
    // The values the decisions read live in the status line, with the rhythm
    // and the reports; 01's foot keeps only the course, where there is one.
    statusLine: {
      extras: slots.statusExtras(model.keyValues.map((item) => item.key)),
      ...(slots.lvefReport ? { valueAddons: { LVEF: slots.lvefReport } } : {}),
    },
    ...(slots.careTimeline ? {
      columnFooters: {
        status: (
          <details className="rounded-md border border-border bg-background" data-testid="cdss-visit-hf-record-foot">
            <summary className="flex min-h-11 cursor-pointer items-center px-2.5 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              {isEnglish ? 'Course timeline' : '病程時間軸'}
            </summary>
            <div className="@container border-t border-border p-2">{slots.careTimeline}</div>
          </details>
        ),
      },
    } : {}),
  }
}
