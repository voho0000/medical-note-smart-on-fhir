/** Shared readiness gate for the two Medical Summary AI pipelines. Model
 * eligibility is intentionally absent: the user's auto-generate toggle applies
 * to every selected model that survives provider/key gating. */
export function shouldAutoRunSummarySlot(input: {
  enabled: boolean
  blocked?: boolean
  authLoading: boolean
  slotKey: string
  busy: boolean
  dataReady: boolean
  hasResult: boolean
  hydratedSlotKey: string | null
  autoRunIdentity: string
  triggeredIdentity: string | null
}) {
  return input.enabled &&
    !input.blocked &&
    !input.authLoading &&
    Boolean(input.slotKey) &&
    !input.busy &&
    input.dataReady &&
    !input.hasResult &&
    input.hydratedSlotKey === input.slotKey &&
    input.triggeredIdentity !== input.autoRunIdentity
}
