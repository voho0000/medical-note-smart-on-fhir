import {
  DEMO_MEDICAL_SUMMARY_GENERATION,
  DEMO_SAFETY_SCAN_GENERATION,
  demoMedicalSummarySnapshots,
  getDemoClinicalInsightSnapshot,
} from '@/src/infrastructure/demo/demo-ai-snapshots'
import { generateMedicalSummaryUseCase } from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'

describe('demo clinical-insight snapshots', () => {
  it('selects the bundled snapshot without consulting a retained model preference', () => {
    expect(getDemoClinicalInsightSnapshot(
      'demo-patient-1',
      'patient',
      'health-overview',
    )?.text).toContain('最近值得注意的健康變化')
  })

  it('never supplies a demo snapshot for a real patient', () => {
    expect(getDemoClinicalInsightSnapshot(
      'real-patient',
      'patient',
      'health-overview',
    )).toBeUndefined()
  })
})

describe('demo medical-summary snapshots', () => {
  it('declares honest pre-generated model provenance without a fabricated time', () => {
    expect(DEMO_MEDICAL_SUMMARY_GENERATION).toEqual({
      source: 'pre-generated',
      modelId: 'gemini-3.1-flash-lite',
      modelName: 'Gemini 3.1 Flash-Lite',
    })
    expect(DEMO_MEDICAL_SUMMARY_GENERATION).not.toHaveProperty('generatedAt')
    expect(DEMO_SAFETY_SCAN_GENERATION).toEqual(DEMO_MEDICAL_SUMMARY_GENERATION)
  })

  it.each(['medical', 'patient'] as const)('passes the current %s summary schema', (audience) => {
    expect(generateMedicalSummaryUseCase.parseResult(
      JSON.stringify(demoMedicalSummarySnapshots[audience]),
    )).not.toBeNull()
  })

  it.each(['medical', 'patient'] as const)('does not restore the retired %s decisions card', (audience) => {
    expect(demoMedicalSummarySnapshots[audience].decisions).toEqual([])
  })
})
