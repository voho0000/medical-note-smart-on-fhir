import type { ResourceNavTarget } from '@/src/application/stores/resource-navigation.store'
import { referenceId } from '@/src/core/utils/observation-selectors'

type ProcedureWithEncounter = {
  id?: string
  encounter?: { reference?: string }
}

/**
 * Preserve visit context for encounter-linked procedures. Standalone
 * procedures deliberately remain without an encounter id so the left-panel
 * router can send them to the Reports > Procedures view instead.
 */
export function resolveProcedureNavigationTarget(
  target: ResourceNavTarget,
  procedures: ProcedureWithEncounter[],
): ResourceNavTarget {
  if (target.resourceType !== 'Procedure') return target
  const procedure = procedures.find((item) => item.id === target.resourceId)
  const encounterId = referenceId(procedure?.encounter?.reference)
  return encounterId ? { ...target, encounterId } : target
}
