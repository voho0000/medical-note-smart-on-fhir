import { patientAiSlotKey } from '@/src/application/hooks/ai-generation/ai-slot-key'
import { clinicalAiInputSignature } from '@/src/application/hooks/ai-generation/use-clinical-ai-input.hook'

const base = {
  patientId: 'patient-1',
  audience: 'medical' as const,
  locale: 'zh-TW' as const,
  modelId: 'gemini-3.1-flash-lite',
  inputSignature: 'abc123',
}

describe('content-bound AI slot keys', () => {
  it('does not expose a slot until a settled clinical-input signature exists', () => {
    expect(patientAiSlotKey({ ...base, inputSignature: '' })).toBe('')
  })

  it('separates results when clinical content or output locale changes', () => {
    const original = patientAiSlotKey(base)
    expect(patientAiSlotKey({ ...base, inputSignature: 'new-data' })).not.toBe(original)
    expect(patientAiSlotKey({ ...base, locale: 'en' })).not.toBe(original)
  })

  it('fingerprints both formatted context and its source catalog', () => {
    const catalog = [{
      key: 'E1',
      resourceType: 'Encounter',
      resourceId: 'enc-1',
      display: 'Stroke follow-up',
      date: '2026-06-17',
    }]
    const original = clinicalAiInputSignature('Patient and visit context', catalog)
    expect(clinicalAiInputSignature('Patient and complete visit context', catalog)).not.toBe(original)
    expect(clinicalAiInputSignature('Patient and visit context', [
      { ...catalog[0], resourceId: 'enc-2' },
    ])).not.toBe(original)
  })
})
