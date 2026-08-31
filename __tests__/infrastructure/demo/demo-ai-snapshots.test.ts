import {
  DEMO_CLINICAL_INSIGHT_GENERATION,
  DEMO_MEDICAL_SUMMARY_GENERATION,
  DEMO_SAFETY_SCAN_GENERATION,
  demoMedicalSummarySnapshots,
  demoSafetyScanSnapshots,
  getDemoClinicalInsightSnapshot,
  remapDemoSnapshotSourceKeys,
} from '@/src/infrastructure/demo/demo-ai-snapshots'
import {
  buildSourceCatalog,
  generateMedicalSummaryUseCase,
  getSourceCatalog,
} from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'
import { scopeClinicalDataForAi } from '@/src/core/utils/ai-clinical-scope.utils'
import {
  listClinicalDocuments,
  resolveSelectedDocuments,
} from '@/src/core/utils/clinical-documents.utils'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'
import { enrichBundleWithNhiDrugTerminology } from '@/src/infrastructure/fhir/services/nhi-drug-terminology-enrichment.service'
import {
  DEFAULT_DATA_FILTERS,
  DEFAULT_DATA_SELECTION,
} from '@/src/shared/constants/data-selection.constants'
import { DEMO_DATA_AS_OF_MS } from '@/src/shared/constants/demo-data.constants'
import {
  auditSafetyGrounding,
  auditSummaryGrounding,
  buildGroundingAuditInput,
} from '../../../scripts/lib/grounding-audit'

describe('demo clinical-insight snapshots', () => {
  it('declares honest pre-generated model provenance without a fabricated time', () => {
    expect(DEMO_CLINICAL_INSIGHT_GENERATION).toEqual({
      source: 'pre-generated',
      modelId: 'gemini-3.1-flash-lite',
      modelName: 'Gemini 3.1 Flash-Lite',
      provider: 'gemini',
    })
    expect(DEMO_CLINICAL_INSIGHT_GENERATION).not.toHaveProperty('generatedAt')
  })

  it('selects the bundled snapshot without consulting a retained model preference', () => {
    expect(getDemoClinicalInsightSnapshot(
      'demo-patient-1',
      'patient',
      'zh-TW',
      'health-overview',
    )?.text).toContain('最近值得注意的健康變化')
  })

  it('never supplies a demo snapshot for a real patient', () => {
    expect(getDemoClinicalInsightSnapshot(
      'real-patient',
      'patient',
      'zh-TW',
      'health-overview',
    )).toBeUndefined()
  })

  it('selects the locale-matched English custom insight snapshot', () => {
    expect(getDemoClinicalInsightSnapshot(
      'demo-patient-1',
      'medical',
      'en',
      'changes',
    )?.text).toContain('Recent important changes')
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

  it.each([
    ['zh-TW', 'medical'],
    ['zh-TW', 'patient'],
    ['en', 'medical'],
    ['en', 'patient'],
  ] as const)('passes the current %s/%s summary schema', (locale, audience) => {
    expect(generateMedicalSummaryUseCase.parseResult(
      JSON.stringify(demoMedicalSummarySnapshots[locale][audience]),
    )).not.toBeNull()
  })

  it.each(['zh-TW', 'en'] as const)('does not restore retired decisions cards in %s', (locale) => {
    expect(demoMedicalSummarySnapshots[locale].medical.decisions).toEqual([])
    expect(demoMedicalSummarySnapshots[locale].patient.decisions).toEqual([])
  })

  it.each(['medical', 'patient'] as const)('ships non-empty English narrative for %s audience', (audience) => {
    const snapshot = demoMedicalSummarySnapshots.en[audience]
    expect(snapshot.headline).toMatch(/[A-Za-z]/)
    expect(snapshot.summary.map((segment) => segment.text).join('')).toMatch(/[A-Za-z]/)
    expect(snapshot.investigations.length).toBeGreaterThan(0)
    expect(demoSafetyScanSnapshots.en[audience].alerts.length).toBeGreaterThan(0)
  })

  it('resolves every bundled summary and safety citation against the enriched default demo AI scope', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bundle = require('../../../public/demo/demo-bundle.json')
    const enriched = await enrichBundleWithNhiDrugTerminology(bundle)
    const parsedData = LocalBundleService.parse(enriched.bundle)
    expect(parsedData).not.toBeNull()
    const includedDocumentIds = resolveSelectedDocuments(
      listClinicalDocuments(parsedData!.collection),
      'latestAdmission',
      [],
    ).map((document) => document.id)
    // Scope against the demo's own as-of date, exactly like the app does for
    // demo data. Using the wall clock made this assertion decay: the bundle's
    // 2026-07-20 dispensings passed their supply window on 2026-08-16 and
    // dropped out of scope, breaking six citations that were correct when the
    // snapshot was written.
    const scopedClinicalData = scopeClinicalDataForAi(
      parsedData!.collection,
      DEFAULT_DATA_SELECTION,
      DEFAULT_DATA_FILTERS,
      includedDocumentIds,
      DEMO_DATA_AS_OF_MS,
    )
    for (const locale of ['zh-TW', 'en'] as const) {
      const catalog = getSourceCatalog(scopedClinicalData, locale)
      const catalogKeys = new Set(catalog.map((source) => source.key))
      const grounding = buildGroundingAuditInput(scopedClinicalData, catalog)
      for (const audience of ['medical', 'patient'] as const) {
        const snapshot = demoMedicalSummarySnapshots[locale][audience]
        const parsedSummary = generateMedicalSummaryUseCase.parseResult(
          JSON.stringify(snapshot),
        )
        expect(parsedSummary).not.toBeNull()
        const finalized = generateMedicalSummaryUseCase.finalizeResult(parsedSummary!, catalog, {
          clinicalData: scopedClinicalData,
          audience,
          locale,
        })
        expect(finalized.sourceIndex.filter((source) => !source.verified)).toEqual([])
        expect(finalized.droppedTimelineCount).toBe(0)
        expect(finalized.problems.find((problem) => problem.sourceKeys.includes('D1')))
          .toEqual(expect.objectContaining({
            documentEvidence: expect.arrayContaining([
              expect.objectContaining({ source: 'D1', quote: expect.any(String) }),
            ]),
          }))
        expect(finalized.timeline.find((event) => event.key === 'D1'))
          .toEqual(expect.objectContaining({
            documentEvidence: expect.arrayContaining([
              expect.objectContaining({ source: 'D1', quote: expect.any(String) }),
            ]),
          }))
        expect(auditSummaryGrounding(snapshot, grounding)).toEqual([])

        const safetySnapshot = demoSafetyScanSnapshots[locale][audience]
        for (const alert of safetySnapshot.alerts) {
          expect((alert.sources ?? []).filter((key) => !catalogKeys.has(key))).toEqual([])
        }
        expect(auditSafetyGrounding(safetySnapshot, grounding)).toEqual([])
      }
    }
  })

  it('pins the demo as-of date to the bundle it describes', () => {
    // The whole point of the frozen clock is that it belongs to THIS bundle.
    // If a regenerated demo moves the newest clinical event, the as-of date has
    // to move with it — otherwise the scope silently drifts again.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bundle = require('../../../public/demo/demo-bundle.json')
    const newestClinicalDate = bundle.entry
      .map((entry: any) => {
        const r = entry.resource
        return r.authoredOn || r.effectiveDateTime || r.period?.start || r.context?.period?.start
      })
      .filter((value: unknown): value is string => typeof value === 'string')
      .sort()
      .at(-1)!

    expect(Date.parse(newestClinicalDate)).toBeLessThanOrEqual(DEMO_DATA_AS_OF_MS)
    // …and not so far ahead that the as-of date stops describing the bundle.
    expect(DEMO_DATA_AS_OF_MS - Date.parse(newestClinicalDate))
      .toBeLessThan(31 * 24 * 60 * 60 * 1000)
  })

  it('keeps every demo medication citation inside the as-of scope', async () => {
    // Regression guard for the failure this pinning fixed: six citations
    // (M16–M21) pointed at dispensings that had aged out of the "active"
    // filter. A plain resolution check on the wall clock would start passing
    // or failing depending on the day it ran.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bundle = require('../../../public/demo/demo-bundle.json')
    const enriched = await enrichBundleWithNhiDrugTerminology(bundle)
    const parsedData = LocalBundleService.parse(enriched.bundle)!
    const includedDocumentIds = resolveSelectedDocuments(
      listClinicalDocuments(parsedData.collection),
      'latestAdmission',
      [],
    ).map((document) => document.id)
    const scoped = scopeClinicalDataForAi(
      parsedData.collection,
      DEFAULT_DATA_SELECTION,
      DEFAULT_DATA_FILTERS,
      includedDocumentIds,
      DEMO_DATA_AS_OF_MS,
    )
    const catalogKeys = new Set(getSourceCatalog(scoped, 'zh-TW').map((source) => source.key))

    const cited = new Set<string>()
    const walk = (value: unknown, field?: string): void => {
      if (Array.isArray(value)) {
        if (field === 'sources' || field === 'sourceKeys') {
          value.forEach((item) => { if (typeof item === 'string') cited.add(item) })
          return
        }
        value.forEach((item) => walk(item, field))
        return
      }
      if (value && typeof value === 'object') {
        Object.entries(value).forEach(([key, item]) => walk(item, key))
        return
      }
      if ((field === 'ref' || field === 'source') && typeof value === 'string') cited.add(value)
    }
    for (const locale of ['zh-TW', 'en'] as const) {
      walk(demoMedicalSummarySnapshots[locale].medical)
      walk(demoMedicalSummarySnapshots[locale].patient)
      walk(demoSafetyScanSnapshots[locale].medical)
      walk(demoSafetyScanSnapshots[locale].patient)
    }

    const unresolvable = [...cited]
      .filter((key) => /^[A-Z]+\d+$/.test(key) && !catalogKeys.has(key))
      .sort()
    expect(unresolvable).toEqual([])
  })

  it('keeps exact NHI terminology from crossing between urinary medicine education items', () => {
    const education = demoMedicalSummarySnapshots['zh-TW'].patient.medicationEducation
    const harnalidge = education.find((item) => item.name.includes('Harnalidge'))
    const oxbu = education.find((item) => item.name.includes('Oxbu'))
    const betmiga = education.find((item) => item.name.includes('Betmiga'))

    expect(harnalidge).toMatchObject({ sources: ['M4'] })
    expect(oxbu).toMatchObject({ sources: ['M5'] })
    expect(betmiga).toMatchObject({ sources: ['M6'] })
    expect(betmiga?.name).toContain('mirabegron')
    expect(betmiga?.benefit).toContain('不是抗膽鹼藥')
    expect(betmiga?.attention).not.toMatch(/口乾|便祕|姿勢.*頭暈/)

    expect(demoMedicalSummarySnapshots['zh-TW'].medical.medicationReview.regimen)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'Harnalidge', sources: ['M4'] }),
        expect.objectContaining({ name: 'Oxbu', sources: ['M5'] }),
        expect.objectContaining({ name: 'Betmiga', sources: ['M6'] }),
      ]))
  })

  it.each(['medical', 'patient'] as const)(
    'remaps stable %s resource ids when another model renumbers the catalog',
    async (audience) => {
      // The full bundle produces a deliberately different key sequence from
      // the default AI scope, matching the small-model prioritization hazard.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const bundle = require('../../../public/demo/demo-bundle.json')
      const enriched = await enrichBundleWithNhiDrugTerminology(bundle)
      const parsedData = LocalBundleService.parse(enriched.bundle)
      expect(parsedData).not.toBeNull()
      const alternateCatalog = buildSourceCatalog(parsedData!.collection)
      const remappedSummary = remapDemoSnapshotSourceKeys(
        demoMedicalSummarySnapshots['zh-TW'][audience],
        alternateCatalog,
      )
      const parsedSummary = generateMedicalSummaryUseCase.parseResult(
        JSON.stringify(remappedSummary),
      )
      expect(parsedSummary).not.toBeNull()
      const finalized = generateMedicalSummaryUseCase.finalizeResult(
        parsedSummary!,
        alternateCatalog,
        {
          clinicalData: parsedData!.collection,
          audience,
          locale: 'zh-TW',
        },
      )

      expect(finalized.sourceIndex.filter((source) => !source.verified)).toEqual([])
      expect(finalized.droppedTimelineCount).toBe(0)
      const remappedDocumentProblem = finalized.problems.find((problem) =>
        problem.documentEvidence?.some((entry) => entry.quote === 'Diebetes mellitus'),
      )
      expect(remappedDocumentProblem?.documentEvidence?.[0]?.source)
        .toBe(remappedDocumentProblem?.sourceKeys[0])
    },
  )
})
