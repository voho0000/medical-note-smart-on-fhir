/**
 * The page's own input surfaces, placed on the decision map.
 *
 * The map draws the pack's decision points; the heart-failure and
 * atrial-fibrillation pages also carry inputs the decisions read — the
 * clinical-values editor, the symptom and sign questions, the diagnosis
 * confirmation and HFpEF calculator, the AF structured questions, the rate or
 * rhythm choice, the rhythm and the course. None of them may drop out of the
 * map. Each page hands its existing components to the screen through these
 * slots, and the screen puts each where the clinician reaches for it.
 */
import type { ReactNode } from 'react'
import type { DecisionPointView, VisitBlock } from '../../types'

export interface VisitMapSurfaces {
  /** Opens the page's clinical-values editor. Drawn as 「補填／修改量測」 in the status line. */
  editValues?: () => void
  /** Opens the editor at one value; stale and missing values in the status line call it. */
  editValue?: (key: string) => void
  /** An inline editor opened from the status line, drawn right under it. */
  statusPanel?: ReactNode
  /**
   * DP-03's fuller questions, folded under the every-visit asks. Opens by
   * itself at a first assessment and when an ask comes back worse.
   */
  asksDetail?: {
    label: string
    content: ReactNode
    openCount?: number
    /**
     * Physician-input requests the block asks itself (the HF page's 懷疑 HF？
     * before a diagnosis). A queue row whose every action only answers one of
     * them is not listed again in 今天要決定.
     */
    requests?: readonly string[]
  }
  /**
   * 01's 診斷 view, beside its 追蹤 view (the asks): the diagnostic assessment
   * and the diagnosis points' cells. A page that has one gets a 診斷／追蹤
   * switch in 01, opening on 診斷 before a diagnosis and on 追蹤 after.
   */
  diagnosis?: {
    content: ReactNode
    dps: readonly string[]
    /** One press to the clinician's own confirmation, for a clinician already sure; the screen then opens 02. */
    quickConfirm?: { label: string; hint: string; onConfirm: () => void }
  }
  /** Inputs a decision point reads, drawn inside that point's opened card. */
  pointExtras?: (point: DecisionPointView) => ReactNode
  /** Folded at the foot of a column: what has no single point to live under. */
  columnFooters?: Partial<Record<VisitBlock, ReactNode>>
}

/** A point's key for placing a surface: the page's own points only. */
export function isPagePoint(point: DecisionPointView, source: DecisionPointView['source'], dps: readonly string[]): boolean {
  return point.source === source && dps.includes(point.dp)
}

/**
 * The first of `dps` the model carries for this page, so a surface lands on a
 * point that exists and — when none does — on the column foot instead of
 * nowhere.
 */
export function firstPresentPoint(
  points: readonly DecisionPointView[],
  source: DecisionPointView['source'],
  dps: readonly string[],
): string | undefined {
  return dps.find((dp) => points.some((point) => point.source === source && point.dp === dp))
}
