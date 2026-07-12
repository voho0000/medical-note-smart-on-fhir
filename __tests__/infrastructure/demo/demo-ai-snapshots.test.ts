import {
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
  it.each(['medical', 'patient'] as const)('passes the current %s summary schema', (audience) => {
    expect(generateMedicalSummaryUseCase.parseResult(
      JSON.stringify(demoMedicalSummarySnapshots[audience]),
    )).not.toBeNull()
  })
})
