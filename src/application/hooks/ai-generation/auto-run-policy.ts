// Shared readiness gate for the auto-running structured-AI pipelines (medical
// summary + safety alerts; moved here from medical-summary/ when the generation
// machinery was factored out). Model eligibility is intentionally absent: the
// user's auto-generate toggle applies to every selected model that survives
// provider/key gating in the caller's resolvedModelId.
export function shouldAutoRunSummarySlot(input: {
  enabled: boolean
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
    !input.authLoading &&
    Boolean(input.slotKey) &&
    !input.busy &&
    input.dataReady &&
    !input.hasResult &&
    input.hydratedSlotKey === input.slotKey &&
    input.triggeredIdentity !== input.autoRunIdentity
}

/**
 * Demo snapshots are frozen, audited outputs for the frozen demo bundle. This
 * gate decides when the caller may install the audited output after the
 * selected slot has finished hydration. Ownership is deliberately handled by
 * the caller: only the canonical model receives it in a result slot; another
 * selected model may use it solely as a presentation fallback.
 */
export function shouldSeedDemoSlot(input: {
  hasDemoSeed: boolean
  slotKey: string
  hasResult: boolean
  hydratedSlotKey: string | null
  patientId: string
  demoPatientId: string
  locale: string
  hasCatalog: boolean
}) {
  return input.hasDemoSeed &&
    Boolean(input.slotKey) &&
    !input.hasResult &&
    input.hydratedSlotKey === input.slotKey &&
    input.patientId === input.demoPatientId &&
    input.locale === 'zh-TW' &&
    input.hasCatalog
}
