import {
  shouldAutoRunSummarySlot,
  shouldSeedDemoSlot,
} from '@/src/application/hooks/ai-generation/auto-run-policy'

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
      slotKey: 'patient-1::medical::gpt-5.4-mini',
      hydratedSlotKey: 'patient-1::medical::gpt-5.4-mini',
      autoRunIdentity: 'patient-1::medical::gpt-5.4-mini::user:1',
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

describe('demo snapshot policy', () => {
  it('seeds a hydrated demo slot even when its key contains a retained non-default model', () => {
    expect(shouldSeedDemoSlot({
      hasDemoSeed: true,
      slotKey: 'demo-patient-1::patient::gpt-5.4-mini',
      hasResult: false,
      hydratedSlotKey: 'demo-patient-1::patient::gpt-5.4-mini',
      patientId: 'demo-patient-1',
      demoPatientId: 'demo-patient-1',
      locale: 'zh-TW',
      hasCatalog: true,
    })).toBe(true)
  })

  it('does not seed a real patient or overwrite an existing result', () => {
    const ready = {
      hasDemoSeed: true,
      slotKey: 'demo-patient-1::patient::gpt-5.4-mini',
      hasResult: false,
      hydratedSlotKey: 'demo-patient-1::patient::gpt-5.4-mini',
      patientId: 'demo-patient-1',
      demoPatientId: 'demo-patient-1',
      locale: 'zh-TW',
      hasCatalog: true,
    }
    expect(shouldSeedDemoSlot({ ...ready, patientId: 'real-patient' })).toBe(false)
    expect(shouldSeedDemoSlot({ ...ready, hasResult: true })).toBe(false)
  })
})
