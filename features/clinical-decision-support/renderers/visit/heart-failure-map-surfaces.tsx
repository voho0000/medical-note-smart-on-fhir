"use client"

import type { HeartFailureMapSurfaceSlots } from '../HeartFailureVisitFlow'
import type { VisitDecisionModel } from '../../types'
import { firstPresentPoint, isPagePoint, type VisitMapSurfaces } from './visit-surfaces'

/** The diagnosis points whose cards carry the diagnostic assessment. */
const DIAGNOSIS_DPS = ['DP-00', 'DP-01', 'DP-34'] as const

/**
 * Where the heart-failure page's surfaces sit on the map:
 *
 * - the clinical-values editor behind 「補填／修改量測」 in the status line, and
 *   behind every stale or missing value there;
 * - 本次評估's follow-up half (symptoms, signs, NYHA, compensation) and the
 *   chief-complaint and weight follow-up under the two asks, as
 *   「其他症狀、徵象與 NYHA」;
 * - the diagnosis confirmation, the diagnostic questions and the HFpEF scores
 *   with their calculator inside DP-00, DP-01 and DP-34's cards (at 01's foot
 *   when the model carries none of them);
 * - the clinical values with their sources and echo report, the rhythm and the
 *   care timeline folded at 01's foot.
 */
export function heartFailureVisitSurfaces(
  slots: HeartFailureMapSurfaceSlots,
  model: VisitDecisionModel,
  isEnglish: boolean,
): VisitMapSurfaces {
  const diagnosisHome = firstPresentPoint(model.points, 'hf', DIAGNOSIS_DPS)
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
      requests: slots.followUpRequests,
      content: (
        <div className="space-y-2" data-testid="cdss-visit-hf-follow-up-questions">
          {slots.followUpQuestions}
          {slots.followUpPriorities}
        </div>
      ),
    },
    pointExtras: (point) => (
      diagnosisHome && isPagePoint(point, 'hf', DIAGNOSIS_DPS) ? slots.diagnosticAssessment : undefined
    ),
    columnFooters: {
      status: (
        <>
          {diagnosisHome ? null : (
            <details className="rounded-md border border-border bg-background" data-testid="cdss-visit-hf-diagnosis-foot">
              <summary className="flex min-h-11 cursor-pointer items-center px-2.5 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                {isEnglish ? 'Diagnostic assessment' : '診斷評估'}
              </summary>
              <div className="border-t border-border p-2">{slots.diagnosticAssessment}</div>
            </details>
          )}
          <details className="rounded-md border border-border bg-background" data-testid="cdss-visit-hf-record-foot">
            <summary className="flex min-h-11 cursor-pointer items-center px-2.5 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              {isEnglish ? 'Clinical values, rhythm and course' : '臨床數值、心律與病程時間軸'}
            </summary>
            <div className="@container border-t border-border p-2">{slots.recordAndCourse}</div>
          </details>
        </>
      ),
    },
  }
}
