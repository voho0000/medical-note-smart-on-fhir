import { shouldAutoRunSummarySlot } from '@/src/application/hooks/medical-summary/summary-auto-run-policy'

const ready = {
  enabled: true,
  authLoading: false,
  slotKey: 'patient-1::medical::gemini-3.1-pro-preview',
  busy: false,
  dataReady: true,
  hasResult: false,
  hydratedSlotKey: 'patient-1::medical::gemini-3.1-pro-preview',
  autoRunIdentity: 'patient-1::medical::gemini-3.1-pro-preview::user:1',
  triggeredIdentity: null,
}

describe('Medical Summary auto-run policy', () => {
  it('allows any selected model slot, not only the Lite model', () => {
    expect(shouldAutoRunSummarySlot(ready)).toBe(true)
    expect(shouldAutoRunSummarySlot({
      ...ready,
      slotKey: 'patient-1::medical::gpt-5-mini',
      hydratedSlotKey: 'patient-1::medical::gpt-5-mini',
      autoRunIdentity: 'patient-1::medical::gpt-5-mini::user:1',
    })).toBe(true)
  })

  it('waits for hydration and does not rerun an existing or attempted slot', () => {
    expect(shouldAutoRunSummarySlot({ ...ready, hydratedSlotKey: null })).toBe(false)
    expect(shouldAutoRunSummarySlot({ ...ready, hasResult: true })).toBe(false)
    expect(shouldAutoRunSummarySlot({
      ...ready,
      triggeredIdentity: ready.autoRunIdentity,
    })).toBe(false)
  })

  it('respects the user-facing auto-generate toggle', () => {
    expect(shouldAutoRunSummarySlot({ ...ready, enabled: false })).toBe(false)
  })
})
