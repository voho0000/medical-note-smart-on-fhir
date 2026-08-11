import {
  DEMO_MEDICAL_SUMMARY_GENERATION,
  DEMO_SAFETY_SCAN_GENERATION,
  demoMedicalSummarySnapshots,
  demoSafetyScanSnapshots,
  getDemoClinicalInsightSnapshot,
} from '@/src/infrastructure/demo/demo-ai-snapshots'
import {
  buildSourceCatalog,
  generateMedicalSummaryUseCase,
} from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'

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

  it('resolves every bundled summary and safety citation against the current demo source catalog', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bundle = require('../../../public/demo/demo-bundle.json')
    const parsedData = LocalBundleService.parse(bundle)
    expect(parsedData).not.toBeNull()
    const catalog = buildSourceCatalog(parsedData!.collection)
    const catalogKeys = new Set(catalog.map((source) => source.key))

    for (const audience of ['medical', 'patient'] as const) {
      const parsedSummary = generateMedicalSummaryUseCase.parseResult(
        JSON.stringify(demoMedicalSummarySnapshots[audience]),
      )
      expect(parsedSummary).not.toBeNull()
      const finalized = generateMedicalSummaryUseCase.finalizeResult(parsedSummary!, catalog, {
        clinicalData: parsedData!.collection,
        audience,
        locale: 'zh-TW',
      })
      expect(finalized.sourceIndex.filter((source) => !source.verified)).toEqual([])
      expect(finalized.droppedTimelineCount).toBe(0)

      for (const alert of demoSafetyScanSnapshots[audience].alerts) {
        expect((alert.sources ?? []).filter((key) => !catalogKeys.has(key))).toEqual([])
      }
    }
  })
})
