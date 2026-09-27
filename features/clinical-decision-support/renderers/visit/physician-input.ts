/**
 * A decision-map action that also answers a card's structured question.
 *
 * The pack may mark an action with `physicianInput` — DP-00 「是」 answers
 * `hf-suspicion`, DP-34 「確認 HFpEF」 answers `hfpef-diagnosis-confirmation`
 * — so pressing it is the same answer the card's own control writes, handed
 * back through the same phenotype-answer store, and the pack recomputes from
 * it. This file only translates the request kind and option id into that
 * store's shape; the ids are wire identifiers, the same ones
 * `PhysicianInputRequestPanel` writes, never clinical wording.
 */
import { todayIsoDate } from '../../stores/clinic-vitals.store'
import type { PhenotypeAnswer } from '../../stores/phenotype-answer.store'
import type { VisitAction } from '../../types'

export type VisitPhysicianInput = NonNullable<VisitAction['physicianInput']>

/**
 * The phenotype answer after `input`, or undefined when the input is not one
 * this host knows how to write — in which case nothing is written and the
 * card's own control remains the way to answer.
 */
export function phenotypeAnswerForInput(
  input: VisitPhysicianInput,
  current: PhenotypeAnswer | undefined,
  now: Date,
): PhenotypeAnswer | undefined {
  const answeredOn = todayIsoDate(now)
  switch (input.request) {
    case 'hf-suspicion':
      return input.optionId === 'suspected' || input.optionId === 'not-suspected'
        ? { ...(current ?? {}), hfSuspicion: input.optionId, answeredOn }
        : undefined
    case 'hfpef-diagnosis-confirmation':
      return { ...(current ?? {}), hfpEfConfirmed: true, answeredOn }
    case 'lvef-phenotype':
      return input.optionId === 'reduced' || input.optionId === 'preserved' || input.optionId === 'unknown'
        ? { ...(current ?? {}), choice: input.optionId, answeredOn }
        : undefined
    default:
      return undefined
  }
}
