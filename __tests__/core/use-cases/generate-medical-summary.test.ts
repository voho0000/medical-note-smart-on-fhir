// Medical Summary use-case tests — the anti-hallucination contract:
// citations resolve against the app-built catalog; unknown keys stay visible
// as unverified; timeline picks with unknown refs are dropped AND counted.
import {
  GenerateMedicalSummaryUseCase,
  buildSourceCatalog,
  buildCoverageStats,
  buildLongitudinalInvestigationContext,
  getSourceCatalog,
  scopeDocumentSources,
  classifyEncounterClass,
  normaliseSummarySourceKey,
} from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'
import {
  MEDICAL_SUMMARY_CARD_REGISTRY,
  registeredMedicalSummaryCards,
} from '@/src/core/use-cases/medical-summary/medical-summary-card-registry'
import { scopeClinicalDataForAi } from '@/src/core/utils/ai-clinical-scope.utils'
import {
  listClinicalDocuments,
  resolveSelectedDocuments,
} from '@/src/core/utils/clinical-documents.utils'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'
import {
  DEFAULT_DATA_FILTERS,
  DEFAULT_DATA_SELECTION,
} from '@/src/shared/constants/data-selection.constants'
import { clinicalNowMs } from '@/src/shared/constants/demo-data.constants'

const useCase = new GenerateMedicalSummaryUseCase()

const CATALOG_INPUT = {
  encounters: [
    {
      id: 'enc-1',
      period: { start: '2026-06-12T09:00:00+08:00' },
      type: [{ text: '內分泌科門診' }],
      serviceProvider: { display: '甲醫學中心' },
    },
    {
      id: 'enc-2',
      period: { start: '2026-05-02T22:10:00+08:00' },
      class: { display: 'emergency' },
      serviceProvider: { display: '丙醫院' },
    },
    {
      id: 'enc-3',
      period: { start: '2026-03-10T00:00:00+08:00', end: '2026-03-16T00:00:00+08:00' },
      class: { code: 'IMP', display: 'inpatient encounter' },
      reasonCode: [{ text: '肺炎' }],
      serviceProvider: { display: '甲醫學中心' },
    },
  ],
  medications: [
    {
      id: 'med-1',
      authoredOn: '2026-05-30',
      medicationCodeableConcept: { text: 'Metformin 500mg' },
      requester: { display: '乙診所' },
    },
  ],
  procedures: [],
  diagnosticReports: [
    {
      id: 'rep-1',
      code: { text: 'HbA1c' },
      effectiveDateTime: '2026-04-18',
      performer: [{ display: '甲醫學中心' }],
    },
  ],
  conditions: [
    { id: 'cond-1', code: { text: '第2型糖尿病' }, recordedDate: '2023-07-01' },
  ],
}

describe('buildSourceCatalog', () => {
  it('builds keyed entries with dates and organizations from the bundle', () => {
    const catalog = buildSourceCatalog(CATALOG_INPUT)
    const byKey = new Map(catalog.map((c) => [c.key, c]))

    expect(byKey.get('E1')).toMatchObject({
      resourceType: 'Encounter',
      resourceId: 'enc-1',
      date: '2026-06-12',
      organization: '甲醫學中心',
    })
    // Encounter.class → deterministic 住院/急診/門診 subtype (never the AI's).
    expect(byKey.get('E2')?.encounterClass).toBe('emergency') // via display text
    expect(byKey.get('E3')?.encounterClass).toBe('inpatient') // via v3-ActCode IMP
    expect(byKey.get('E3')?.endDate).toBe('2026-03-16')
    expect(byKey.get('E1')?.encounterClass).toBeUndefined() // no class field

    // Sorted most-recent-first: E2 is the older ER visit.
    expect(byKey.get('E2')).toMatchObject({ resourceId: 'enc-2', date: '2026-05-02' })
    expect(byKey.get('M1')).toMatchObject({
      resourceId: 'med-1',
      display: 'Metformin 500mg',
      organization: '乙診所',
    })
    expect(byKey.get('L1')).toMatchObject({ resourceId: 'rep-1', display: 'HbA1c' })
    expect(byKey.get('C1')).toMatchObject({ resourceId: 'cond-1' })
  })

  it('cites Health Bank lab Observations without indexing their bridge-generated report containers', () => {
    const catalog = buildSourceCatalog({
      diagnosticReports: [
        {
          id: 'synthetic-cbc',
          meta: { source: 'nhi-fhir-bridge/scraper' },
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'LAB' }] }],
          code: { text: 'CBC' },
          result: [{ reference: 'Observation/hb' }],
          effectiveDateTime: '2026-05-05',
        },
        {
          id: 'real-r8-report',
          meta: {
            source: 'https://nhi-fhir-bridge.github.io/source/health-bank-sdk-json',
            tag: [{
              system: 'https://nhi-fhir-bridge.github.io/CodeSystem/health-bank-sdk-section',
              code: 'r8',
            }],
          },
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'RAD' }] }],
          code: { text: 'Chest X-ray' },
          conclusion: 'No acute pulmonary finding.',
          effectiveDateTime: '2026-05-04',
        },
      ],
      observations: [{
        id: 'hb',
        meta: { source: 'nhi-fhir-bridge/scraper' },
        code: { text: 'Hb' },
        effectiveDateTime: '2026-05-05',
        valueQuantity: { value: 9.2, unit: 'g/dL' },
      }],
    })

    expect(catalog.find((source) => source.resourceId === 'synthetic-cbc')).toBeUndefined()
    expect(catalog.find((source) => source.resourceId === 'hb')).toMatchObject({
      key: 'O1',
      resourceType: 'Observation',
      display: 'Hb',
    })
    expect(catalog.find((source) => source.resourceId === 'real-r8-report')).toMatchObject({
      key: 'L2',
      resourceType: 'DiagnosticReport',
    })
  })

  it('does not classify an ordinary server DiagnosticReport as a synthetic Health Bank grouping', () => {
    const catalog = buildSourceCatalog({
      diagnosticReports: [{
        id: 'server-cbc',
        category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'LAB' }] }],
        code: { text: 'CBC' },
        result: [{ reference: 'Observation/server-hb' }],
        effectiveDateTime: '2026-05-05',
      }],
    })

    expect(catalog).toEqual([
      expect.objectContaining({ resourceId: 'server-cbc', resourceType: 'DiagnosticReport' }),
    ])
  })

  it('uses English encounter type and ICD display while preserving the organization', () => {
    const [source] = buildSourceCatalog({
      encounters: [{
        id: 'enc-bph',
        class: { code: 'AMB', display: 'ambulatory' },
        type: [{
          text: '門診',
          coding: [{ code: 'outpatient', display: '門診' }],
        }],
        reasonCode: [{
          text: 'N400 良性攝護腺增生未伴有下泌尿道症狀',
          coding: [{
            system: 'http://hl7.org/fhir/sid/icd-10-cm',
            code: 'N40.0',
            display: 'Benign prostatic hyperplasia without lower urinary tract symptoms',
          }],
        }],
        serviceProvider: { display: '示範長青醫院' },
      }],
    }, 'en')

    expect(source).toMatchObject({
      display: 'Outpatient (N40.0 Benign prostatic hyperplasia without lower urinary tract symptoms)',
      organization: '示範長青醫院',
    })
  })

  it('reuses the Reports-area English order name for imaging citations', () => {
    const [source] = buildSourceCatalog({
      diagnosticReports: [{
        id: 'chest-xray',
        code: {
          text: '胸腔檢查（包括各種角度部位之胸腔檢查）',
          coding: [{
            code: '32001C',
            display: '胸腔檢查（包括各種角度部位之胸腔檢查）',
          }],
        },
        effectiveDateTime: '2026-06-02',
        performer: [{ display: '示範長青醫院' }],
      }],
    }, 'en')

    expect(source).toMatchObject({
      display: 'Chest X-ray',
      organization: '示範長青醫院',
    })
  })

  it('keeps every selected medication citable without a hidden catalog cap', () => {
    const recentAcute = Array.from({ length: 41 }, (_, index) => ({
      id: `acute-${index}`,
      authoredOn: `2026-06-${String(30 - (index % 20)).padStart(2, '0')}`,
      medicationCodeableConcept: {
        coding: [{ system: 'nhi', code: `A${index}`, display: `Acute ${index}` }],
      },
    }))
    const oldChronic = {
      id: 'old-chronic-forxiga',
      authoredOn: '2024-01-01',
      medicationCodeableConcept: {
        coding: [{ system: 'nhi', code: 'BC26476100', display: 'Forxiga Film-coated Tablets 10mg' }],
      },
      courseOfTherapyType: {
        coding: [{ code: 'continuous' }],
      },
    }

    const medicationSources = buildSourceCatalog({
      medications: [...recentAcute, oldChronic],
    }).filter((source) => source.resourceType.startsWith('Medication'))

    expect(medicationSources).toHaveLength(42)
    expect(medicationSources.some((source) => source.resourceId === 'old-chronic-forxiga')).toBe(true)
  })

  it('uses English medication coding displays in the AI source catalog', () => {
    const [source] = buildSourceCatalog({
      medications: [{
        id: 'forxiga-bilingual',
        medicationCodeableConcept: {
          text: '福適佳膜衣錠10毫克',
          coding: [{ display: 'Forxiga Film-coated Tablets 10mg' }],
        },
      }],
    })

    expect(source.display).toBe('Forxiga Film-coated Tablets 10mg')
  })
})

describe('buildSourceCatalog — care plans', () => {
  it('adds care plans as navigable "K" entries (title/date/org from the plan)', () => {
    const catalog = buildSourceCatalog({
      carePlans: [
        {
          id: 'cp-1',
          title: '末期腎臟病前期照護計畫',
          period: { start: '2024-06-13' },
          author: { display: '示範北辰醫院' },
        },
      ],
    } as never)
    const k1 = catalog.find((c) => c.key === 'K1')
    expect(k1).toMatchObject({
      resourceType: 'CarePlan',
      resourceId: 'cp-1',
      display: '末期腎臟病前期照護計畫',
      date: '2024-06-13',
      organization: '示範北辰醫院',
    })
  })
})

describe('buildSourceCatalog — clinical documents', () => {
  it('adds navigable D keys for DocumentReference and Composition resources', () => {
    const catalog = buildSourceCatalog({
      documentReferences: [
        {
          id: 'discharge-1',
          type: { text: '出院病摘' },
          date: '2026-06-20',
          context: { period: { start: '2026-06-02', end: '2026-06-05' } },
          author: [{ display: '甲醫院' }],
        },
      ],
      compositions: [
        {
          id: 'ips-1',
          title: 'International Patient Summary',
          date: '2026-07-01',
          author: [{ display: '乙醫院' }],
        },
      ],
    } as never)

    expect(catalog.find((source) => source.key === 'D1')).toMatchObject({
      resourceType: 'Composition',
      resourceId: 'ips-1',
      display: 'International Patient Summary',
      date: '2026-07-01',
      organization: '乙醫院',
    })
    expect(catalog.find((source) => source.key === 'D2')).toMatchObject({
      resourceType: 'DocumentReference',
      resourceId: 'discharge-1',
      display: '出院病摘',
      date: '2026-06-02',
      organization: '甲醫院',
    })
  })

  it('exposes only documents included in the AI context and renumbers D keys', () => {
    const scoped = scopeDocumentSources([
      { key: 'E1', resourceType: 'Encounter', resourceId: 'enc-1', display: 'visit' },
      { key: 'D1', resourceType: 'Composition', resourceId: 'doc-new', display: 'IPS' },
      { key: 'D2', resourceType: 'DocumentReference', resourceId: 'doc-selected', display: '出院病摘' },
    ], ['doc-selected'])

    expect(scoped.map((source) => [source.key, source.resourceId])).toEqual([
      ['E1', 'enc-1'],
      ['D1', 'doc-selected'],
    ])
  })

  it('uses the linked Encounter institution when a discharge summary has no author', () => {
    const catalog = buildSourceCatalog({
      encounters: [{
        id: 'enc-discharge',
        serviceProvider: { display: '長庚嘉義' },
      }],
      documentReferences: [{
        id: 'discharge-without-author',
        type: { text: '出院病摘' },
        context: {
          encounter: [{ reference: 'Encounter/enc-discharge' }],
          period: { start: '2025-05-18' },
        },
        content: [{
          attachment: {
            title: '出院病摘 — 長庚嘉義 2025-05-18~2025-05-22',
          },
        }],
      }],
    } as never)

    expect(catalog.find((source) => source.resourceId === 'discharge-without-author')).toMatchObject({
      resourceType: 'DocumentReference',
      organization: '長庚嘉義',
    })
  })

  it('falls back to the bridge document title when no structured institution exists', () => {
    const catalog = buildSourceCatalog({
      documentReferences: [{
        id: 'title-only-document',
        content: [{
          attachment: {
            title: '出院病摘 — 長庚嘉義 2025-05-18~2025-05-22',
          },
        }],
      }],
    } as never)

    expect(catalog.find((source) => source.resourceId === 'title-only-document')?.organization)
      .toBe('長庚嘉義')
  })
})

describe('buildLongitudinalInvestigationContext', () => {
  it('surfaces serial labs and imaging from all available reports so they are not labeled single', () => {
    const bridgeLabMeta = { meta: { source: 'nhi-fhir-bridge/scraper' } }
    const input = {
      diagnosticReports: [
        {
          ...bridgeLabMeta,
          id: 'a1c-new',
          category: [{ text: 'Laboratory' }],
          code: { text: 'HbA1c' },
          effectiveDateTime: '2026-06-02',
          result: [{ reference: 'Observation/obs-a1c-new' }],
        },
        {
          ...bridgeLabMeta,
          id: 'a1c-old',
          category: [{ text: 'Laboratory' }],
          code: { text: 'HbA1c' },
          effectiveDateTime: '2025-12-09',
          result: [{ reference: 'Observation/obs-a1c-old' }],
        },
        {
          ...bridgeLabMeta,
          id: 'a1c-mid-1',
          category: [{ text: 'Laboratory' }],
          code: { text: 'HbA1c' },
          effectiveDateTime: '2026-03-10',
          result: [{ reference: 'Observation/obs-a1c-mid-1' }],
        },
        {
          ...bridgeLabMeta,
          id: 'a1c-mid-2',
          category: [{ text: 'Laboratory' }],
          code: { text: 'HbA1c' },
          effectiveDateTime: '2026-01-08',
          result: [{ reference: 'Observation/obs-a1c-mid-2' }],
        },
        {
          ...bridgeLabMeta,
          id: 'psa-new',
          category: [{ text: 'Laboratory' }],
          code: { text: 'PSA' },
          effectiveDateTime: '2026-06-02',
          result: [{ reference: 'Observation/obs-psa-new' }],
        },
        {
          ...bridgeLabMeta,
          id: 'psa-old',
          category: [{ text: 'Laboratory' }],
          code: { text: 'PSA' },
          effectiveDateTime: '2025-02-10',
          result: [{ reference: 'Observation/obs-psa-old' }],
        },
        {
          id: 'cxr-new',
          category: [{ text: 'Radiology' }],
          code: { text: '胸腔檢查' },
          effectiveDateTime: '2026-06-02',
          conclusion: 'Tortuosity thoracic aorta. Borderline cardiomegaly.',
        },
        {
          id: 'cxr-old',
          category: [{ text: 'Radiology' }],
          code: { text: '胸腔檢查' },
          effectiveDateTime: '2026-05-25',
          conclusion: 'Widening of upper mediastinum. Cardiomegaly.',
        },
      ],
      observations: [
        {
          id: 'obs-a1c-new',
          code: { text: 'HbA1c' },
          effectiveDateTime: '2026-06-02',
          valueQuantity: { value: 6.6, unit: '%' },
        },
        {
          id: 'obs-a1c-old',
          code: { text: 'HbA1c' },
          effectiveDateTime: '2025-12-09',
          valueQuantity: { value: 6.7, unit: '%' },
        },
        {
          id: 'obs-a1c-mid-1',
          code: { text: 'HbA1c' },
          effectiveDateTime: '2026-03-10',
          valueQuantity: { value: 6.8, unit: '%' },
        },
        {
          id: 'obs-a1c-mid-2',
          code: { text: 'HbA1c' },
          effectiveDateTime: '2026-01-08',
          valueQuantity: { value: 7.0, unit: '%' },
        },
        {
          id: 'obs-psa-new',
          code: { text: 'PSA' },
          effectiveDateTime: '2026-06-02',
          valueQuantity: { value: 0.64, unit: 'ng/mL' },
        },
        {
          id: 'obs-psa-old',
          code: { text: 'PSA' },
          effectiveDateTime: '2025-02-10',
          valueQuantity: { value: 1.32, unit: 'ng/mL' },
        },
      ],
    }
    const catalog = buildSourceCatalog(input as never)
    const context = buildLongitudinalInvestigationContext(input as never, catalog)

    expect(context).toContain('NOT a single result')
    expect(context).not.toContain('6.7 % (2025-12-09;')
    expect(context).toContain('HbA1c: 7 % (2026-01-08; O4)')
    expect(context).toContain('6.8 % (2026-03-10; O3)')
    expect(context).toContain('6.6 % (2026-06-02; O1)')
    expect(context).toContain('PSA: 1.32 ng/mL (2025-02-10; O6)')
    expect(context).toContain('0.64 ng/mL (2026-06-02; O2)')
    expect(context).toContain('胸腔檢查:')
    expect(context).toContain('2026-05-25;')
    expect(context).toContain('2026-06-02;')
  })
})

describe('buildCoverageStats', () => {
  it('counts everything and derives the date range + unique organizations', () => {
    const stats = buildCoverageStats(CATALOG_INPUT)
    expect(stats).toMatchObject({
      start: '2026-03-10',
      end: '2026-06-12',
      organizations: 3, // 甲醫學中心, 丙醫院, 乙診所
      encounters: 3,
      medications: 1,
      labs: 1,
      procedures: 0,
    })
  })
})

describe('classifyEncounterClass', () => {
  it('maps v3-ActCode codes', () => {
    expect(classifyEncounterClass({ code: 'IMP' })).toBe('inpatient')
    expect(classifyEncounterClass({ code: 'ACUTE' })).toBe('inpatient')
    expect(classifyEncounterClass({ code: 'EMER' })).toBe('emergency')
    expect(classifyEncounterClass({ code: 'AMB' })).toBe('outpatient')
  })

  it('handles CodeableConcept-ish shapes from the bridge', () => {
    expect(classifyEncounterClass({ coding: [{ code: 'IMP' }] })).toBe('inpatient')
    expect(classifyEncounterClass({ coding: [{ display: '住院' }] })).toBe('inpatient')
  })

  it('falls back to display/text keywords (zh + en)', () => {
    expect(classifyEncounterClass({ display: '住院' })).toBe('inpatient')
    expect(classifyEncounterClass({ display: 'emergency' })).toBe('emergency')
    expect(classifyEncounterClass({ text: '門診' })).toBe('outpatient')
  })

  it('returns undefined for unknown or missing class', () => {
    expect(classifyEncounterClass(undefined)).toBeUndefined()
    expect(classifyEncounterClass({ code: 'VR' })).toBeUndefined() // virtual — no zh mapping yet
  })
})

describe('parseResult', () => {
  it('parses a valid reply wrapped in markdown fences', () => {
    const reply =
      '```json\n' +
      JSON.stringify({
        headline: '68 歲男性，糖尿病跨院追蹤',
        summary: [{ text: '血糖惡化', emphasis: true, sources: ['L1'] }],
        decisions: [],
        timeline: [],
      }) +
      '\n```'
    const parsed = useCase.parseResult(reply)
    expect(parsed).not.toBeNull()
    expect(parsed!.headline).toContain('糖尿病')
    expect(parsed!.medicationEducation).toEqual([])
    expect(parsed!.medicationReview).toEqual({ regimen: [], changes: [], reconciliation: [] })
  })

  it('rejects malformed / off-schema replies', () => {
    expect(useCase.parseResult('not json at all')).toBeNull()
    expect(useCase.parseResult('{"headline": "x"}')).toBeNull() // missing summary
  })

  // Regression (2026-07): Claude Haiku's verbose-but-valid outputs — 27
  // narrative segments, 8 cited keys, an oversize basis — were rejected
  // wholesale by hard schema maxes, making its parse-failure rate near-total.
  // Size overflows must CLAMP, not reject.
  it('clamps oversize-but-valid replies instead of rejecting them', () => {
    const reply = JSON.stringify({
      headline: 'x'.repeat(300),
      summary: Array.from({ length: 27 }, (_, i) => ({
        text: `段落${i}。`,
        emphasis: false,
        sources: i === 0 ? ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8'] : [],
      })),
      problems: [{ label: '慢性腎臟病', basis: 'b'.repeat(100), kind: 'careplan', sources: ['E1'] }],
      decisions: [],
      timeline: [],
    })
    const parsed = useCase.parseResult(reply)
    expect(parsed).not.toBeNull()
    expect(parsed!.headline).toHaveLength(240)
    expect(parsed!.summary).toHaveLength(27) // roomy runaway guard is 32
    expect(parsed!.summary[0].sources).toHaveLength(6)
    expect(parsed!.problems[0].basis).toHaveLength(80)
  })

  // Diagnostic logging: transient Flash-Lite parse failures must leave a
  // truncated head of the raw reply in the console, never fail silently.
  describe('failure diagnostics', () => {
    let warnSpy: jest.SpyInstance

    beforeEach(() => {
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    })
    afterEach(() => {
      warnSpy.mockRestore()
    })

    it('warns with the failure reason and the raw reply head', () => {
      expect(useCase.parseResult('not json at all')).toBeNull()
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('no parseable JSON found'),
        'not json at all',
      )

      // Broken syntax also fails extraction (shared llm-json extractor
      // repairs trailing commas but not arbitrary syntax errors).
      expect(useCase.parseResult('{"headline": "x", broken}')).toBeNull()
      expect(warnSpy).toHaveBeenLastCalledWith(
        expect.stringContaining('no parseable JSON found'),
        expect.any(String),
      )

      expect(useCase.parseResult('{"headline": "x"}')).toBeNull()
      expect(warnSpy).toHaveBeenLastCalledWith(
        expect.stringContaining('schema mismatch'),
        expect.any(String),
      )
    })

    it('truncates the logged head to 300 chars', () => {
      const longReply = 'x'.repeat(1000)
      expect(useCase.parseResult(longReply)).toBeNull()
      const loggedHead = warnSpy.mock.calls[0][1] as string
      expect(loggedHead).toHaveLength(300)
    })

    it('does not warn on a successful parse', () => {
      const reply = JSON.stringify({
        headline: 'h',
      problems: [],
        summary: [{ text: 't', emphasis: false, sources: [] }],
        decisions: [],
        timeline: [],
      })
      expect(useCase.parseResult(reply)).not.toBeNull()
      expect(warnSpy).not.toHaveBeenCalled()
    })
  })
})

describe('modular summary generation contract', () => {
  const input = {
    clinicalContext: 'Encounter and laboratory context',
    catalog: [{
      key: 'E1',
      resourceType: 'Encounter',
      resourceId: 'enc-1',
      display: 'Outpatient visit',
    }],
    locale: 'en' as const,
    audience: 'medical' as const,
  }

  it('builds a card-specific output contract instead of requiring the full summary object', () => {
    const messages = useCase.buildModuleMessages(input, 'timeline')
    expect(messages[0].content).toContain('Generate ONLY the "timeline" module')
    expect(messages[0].content).toContain('"timeline":')
    expect(messages[0].content).toContain('Do not return fields belonging to another module')
  })

  it('forces medical medication education to an empty literal instead of inviting unused fields', () => {
    const messages = useCase.buildModuleMessages(input, 'medications')
    expect(messages[0].content).toContain('"medicationEducation" MUST be the literal empty array []')
    expect(messages[0].content).toContain('{"medicationEducation": [], "medicationReview"')

    const patientMessages = useCase.buildModuleMessages(
      { ...input, audience: 'patient' as const },
      'medications',
    )
    expect(patientMessages[0].content).toContain('"benefit": "<benefit>"')
    expect(patientMessages[0].content).not.toContain('MUST be the literal empty array')
  })

  it('builds one batch prompt with five independently delimited JSON blocks', () => {
    const messages = useCase.buildBatchModuleMessages(input)
    const prompt = messages[0].content

    expect(prompt).toContain('BATCH MODULAR OUTPUT CONTRACT')
    for (const moduleId of ['priorities', 'problems', 'timeline', 'investigations', 'medications']) {
      expect(prompt).toContain(`<<<MEDIPRISMA_MODULE:${moduleId}>>>`)
      expect(prompt).toContain(`<<<END_MEDIPRISMA_MODULE:${moduleId}>>>`)
    }
    expect(prompt.indexOf('<<<MEDIPRISMA_MODULE:priorities>>>'))
      .toBeLessThan(prompt.indexOf('<<<MEDIPRISMA_MODULE:medications>>>'))
    expect(prompt).not.toContain('The medications block is FIRST and MANDATORY')
    expect(messages[1].content.match(/Patient clinical data:/g)).toHaveLength(1)
  })

  it('builds one batch from the six registered cards with Safety last', () => {
    const cards = registeredMedicalSummaryCards(input)
    const messages = useCase.buildRegisteredCardBatchMessages(
      input,
      cards.map((card) => card.buildBatchInstruction(input)),
    )
    const prompt = messages[0].content

    expect(cards.map((card) => card.id)).toEqual([
      'priorities',
      'problems',
      'timeline',
      'investigations',
      'medications',
      'safety',
    ])
    expect(prompt).toContain('Generate all 6 registered cards')
    expect(prompt).not.toContain('Output ONLY a JSON object matching this schema')
    expect(prompt).toContain('<<<MEDIPRISMA_MODULE:safety>>>')
    expect(prompt).toContain('<<<END_MEDIPRISMA_MODULE:safety>>>')
    expect(prompt.indexOf('<<<MEDIPRISMA_MODULE:safety>>>'))
      .toBeGreaterThan(prompt.indexOf('<<<END_MEDIPRISMA_MODULE:medications>>>'))
    expect(messages[1].content.match(/Patient clinical data:/g)).toHaveLength(1)
  })

  it('puts the compact priorities card first for a local endpoint', () => {
    const cards = registeredMedicalSummaryCards({
      ...input,
      harnessProfile: 'local-small',
    })

    expect(cards.map((card) => card.id)).toEqual([
      'priorities',
      'medications',
      'problems',
      'timeline',
      'investigations',
      'safety',
    ])
  })

  it('supports removing a card without adding an orchestration branch', () => {
    const cards = registeredMedicalSummaryCards(input, [
      'priorities',
      'problems',
      'timeline',
      'investigations',
      'medications',
    ])
    const messages = useCase.buildRegisteredCardBatchMessages(
      input,
      cards.map((card) => card.buildBatchInstruction(input)),
    )
    const prompt = messages[0].content

    expect(MEDICAL_SUMMARY_CARD_REGISTRY.safety.id).toBe('safety')
    expect(prompt).toContain('Generate all 5 registered cards')
    expect(prompt).not.toContain('<<<MEDIPRISMA_MODULE:safety>>>')
  })

  it('builds one retry batch containing only the failed registered cards', () => {
    const cards = registeredMedicalSummaryCards(input, [
      'problems',
      'timeline',
      'investigations',
    ])
    const messages = useCase.buildRegisteredCardBatchMessages(
      input,
      cards.map((card) => card.buildBatchInstruction(input)),
    )
    const prompt = messages[0].content

    expect(prompt).toContain('Generate all 3 registered cards')
    expect(prompt).toContain('<<<MEDIPRISMA_MODULE:problems>>>')
    expect(prompt).toContain('<<<MEDIPRISMA_MODULE:timeline>>>')
    expect(prompt).toContain('<<<MEDIPRISMA_MODULE:investigations>>>')
    expect(prompt).not.toContain('<<<MEDIPRISMA_MODULE:priorities>>>')
    expect(prompt).not.toContain('<<<MEDIPRISMA_MODULE:medications>>>')
    expect(prompt).not.toContain('<<<MEDIPRISMA_MODULE:safety>>>')
  })

  it('can build a smaller requested-module batch for local-model A/B evaluation', () => {
    const messages = useCase.buildBatchModuleMessages(input, [
      'medications',
      'priorities',
      'problems',
    ])
    const prompt = messages[0].content

    expect(prompt).toContain('Generate only the 3 requested modules')
    expect(prompt).toContain('<<<MEDIPRISMA_MODULE:medications>>>')
    expect(prompt).toContain('<<<MEDIPRISMA_MODULE:priorities>>>')
    expect(prompt).toContain('<<<MEDIPRISMA_MODULE:problems>>>')
    expect(prompt).not.toContain('<<<MEDIPRISMA_MODULE:timeline>>>')
    expect(prompt).not.toContain('<<<MEDIPRISMA_MODULE:investigations>>>')
    expect(messages[1].content.match(/Patient clinical data:/g)).toHaveLength(1)
  })

  it('uses a shorter module-scoped contract for an instruction-sensitive local endpoint', () => {
    const frontier = useCase.buildBatchModuleMessages(input)
    const local = useCase.buildBatchModuleMessages({
      ...input,
      harnessProfile: 'local-small' as const,
    })

    expect(local[0].content).toContain('NON-NEGOTIABLE EVIDENCE CONTRACT')
    expect(local[0].content).toContain('Never create an active problem from medication evidence alone')
    expect(local[0].content).toContain('The medications block is FIRST and MANDATORY')
    expect(local[0].content.indexOf('<<<MEDIPRISMA_MODULE:medications>>>'))
      .toBeLessThan(local[0].content.indexOf('<<<MEDIPRISMA_MODULE:priorities>>>'))
    expect(local[0].content.length).toBeLessThan(frontier[0].content.length / 2)
  })

  it('sends only module-relevant keyed evidence on a local retry', () => {
    const messages = useCase.buildModuleMessages({
      ...input,
      harnessProfile: 'local-small' as const,
      clinicalContext: [
        '## Records',
        '- [M1] Metformin 500 mg BID',
        '- [L1] HbA1c 8.2%',
        'Newest record date: 2026-06-20.',
      ].join('\n'),
      catalog: [
        { key: 'M1', resourceType: 'MedicationRequest', resourceId: 'med-1', display: 'Metformin 500 mg BID' },
        { key: 'L1', resourceType: 'DiagnosticReport', resourceId: 'lab-1', display: 'HbA1c 8.2%' },
      ],
    }, 'medications')

    expect(messages[1].content).toContain('[M1] Metformin 500 mg BID')
    expect(messages[1].content).not.toContain('[L1] HbA1c 8.2%')
    expect(messages[0].content).toContain('MEDICATIONS:')
    expect(messages[0].content).not.toContain('INVESTIGATIONS:')
  })

  it('scrubs patient literals from appended context and source labels at the final boundary', () => {
    const messages = useCase.buildBatchModuleMessages({
      ...input,
      clinicalContext: 'Imaging: 王小明右肺結節',
      piiLiterals: ['王小明'],
      catalog: [{
        ...input.catalog[0],
        display: '王小明門診紀錄',
      }],
    })
    expect(messages[1].content).not.toContain('王小明')
    expect(messages[1].content).toContain('Imaging: [已遮蔽]右肺結節')
    expect(messages[1].content).toContain('[已遮蔽]門診紀錄')
  })

  it('does not accept an unrelated/defaulted object as a successful medications module', () => {
    const unrelatedReply = JSON.stringify({ timeline: [] })
    expect(useCase.parseModuleResult('medications', unrelatedReply)).toBeNull()
    expect(useCase.parseBatchModuleResult('medications', unrelatedReply)).toBeNull()
  })

  it('validates each module independently so one malformed card does not discard another', () => {
    const priorities = useCase.parseModuleResult('priorities', '{"headline":"broken"}')
    const problems = useCase.parseModuleResult('problems', JSON.stringify({
      problems: [{
        label: 'Chronic kidney disease',
        basis: 'Repeated clinic records',
        kind: 'diagnosis',
        sources: ['E1'],
      }],
    }))

    expect(priorities).toBeNull()
    expect(problems?.problems).toHaveLength(1)
  })

  it('salvages only complete validated priority segments before a malformed tail', () => {
    const malformed = '{"headline":"腎功能需追蹤","summary":[' +
      '{"text":"紀錄顯示","emphasis":false,"sources":[]},' +
      '{"text":"eGFR 持續下降","emphasis":true,"sources":["O1","O2"]},' +
      '{"text]":"不應猜回的尾段","sources":["M99"]}'

    const parsed = useCase.parseModuleResult('priorities', malformed)

    expect(parsed).toEqual({
      headline: '腎功能需追蹤',
      summary: [
        { text: '紀錄顯示', emphasis: false, sources: [] },
        { text: 'eGFR 持續下降', emphasis: true, sources: ['O1', 'O2'] },
      ],
    })
    expect(JSON.stringify(parsed)).not.toContain('M99')
  })

  it('does not salvage a single isolated priority fragment', () => {
    const malformed = '{"headline":"不完整","summary":[' +
      '{"text":"只有一段","emphasis":false,"sources":["E1"]},' +
      '{"text]":"broken"}'

    expect(useCase.parseModuleResult('priorities', malformed)).toBeNull()
  })

  it('salvages valid batch blocks around a malformed neighbouring block', () => {
    const batchReply = [
      '<<<MEDIPRISMA_MODULE:priorities>>>',
      JSON.stringify({
        headline: 'Complex cross-facility care',
        summary: [{ text: 'Kidney function needs follow-up.', sources: ['E1'] }],
      }),
      '<<<END_MEDIPRISMA_MODULE:priorities>>>',
      '<<<MEDIPRISMA_MODULE:problems>>>',
      '{"problems": [}',
      '<<<END_MEDIPRISMA_MODULE:problems>>>',
      '<<<MEDIPRISMA_MODULE:timeline>>>',
      JSON.stringify({ timeline: [] }),
      '<<<END_MEDIPRISMA_MODULE:timeline>>>',
      '<<<MEDIPRISMA_MODULE:investigations>>>',
      JSON.stringify({ investigations: [] }),
      '<<<END_MEDIPRISMA_MODULE:investigations>>>',
      '<<<MEDIPRISMA_MODULE:medications>>>',
      JSON.stringify({
        medicationEducation: [],
        medicationReview: { regimen: [], changes: [], reconciliation: [] },
      }),
      '<<<END_MEDIPRISMA_MODULE:medications>>>',
    ].join('\n')

    expect(useCase.parseBatchModuleResult('priorities', batchReply)?.headline)
      .toBe('Complex cross-facility care')
    expect(useCase.parseBatchModuleResult('problems', batchReply)).toBeNull()
    expect(useCase.parseBatchModuleResult('timeline', batchReply)?.timeline).toEqual([])
    expect(useCase.parseBatchModuleResult('investigations', batchReply)?.investigations).toEqual([])
    expect(useCase.parseBatchModuleResult('medications', batchReply)?.medicationReview.regimen)
      .toEqual([])
  })

  it('salvages a complete final JSON block when only its closing marker is truncated', () => {
    const reply = [
      '<<<MEDIPRISMA_MODULE:medications>>>',
      JSON.stringify({
        medicationEducation: [],
        medicationReview: { regimen: [], changes: [], reconciliation: [] },
      }),
    ].join('\n')

    expect(useCase.parseBatchModuleResult('medications', reply)?.medicationReview.changes)
      .toEqual([])
  })

  it('does not treat a parseable streaming block as complete before its closing marker', () => {
    const openBlock = [
      '<<<MEDIPRISMA_MODULE:problems>>>',
      JSON.stringify({ problems: [] }),
    ].join('\n')

    expect(useCase.parseBatchModuleResult('problems', openBlock)?.problems).toEqual([])
    expect(useCase.hasCompleteBatchModuleBlock('problems', openBlock)).toBe(false)
    expect(useCase.hasCompleteBatchModuleBlock(
      'problems',
      `${openBlock}\n<<<END_MEDIPRISMA_MODULE:problems>>>`,
    )).toBe(true)
  })

  it('repairs harmless citation formatting and reports only truly unknown keys', () => {
    const problems = useCase.parseModuleResult('problems', JSON.stringify({
      problems: [{
        label: 'Invented medication problem',
        kind: 'medication',
        sources: ['M1', '[ e 1 ]'],
      }],
    }))

    expect(problems).not.toBeNull()
    expect(normaliseSummarySourceKey('[ e 1 ]')).toBe('E1')
    expect(useCase.findUnknownSourceKeys(problems, [{
      key: 'E1',
      resourceType: 'Encounter',
      resourceId: 'enc-1',
      display: 'Clinic visit',
    }])).toEqual(['M1'])
  })

  it('merges a retried module into an existing draft without replacing successful cards', () => {
    const initial = useCase.createEmptyAiResult()
    const problems = useCase.parseModuleResult('problems', JSON.stringify({
      problems: [{
        label: 'Chronic kidney disease',
        kind: 'diagnosis',
        sources: ['E1'],
      }],
    }))
    const priorities = useCase.parseModuleResult('priorities', JSON.stringify({
      headline: 'Complex cross-facility care',
      summary: [{ text: 'Kidney function needs follow-up.', sources: ['E1'] }],
    }))
    expect(problems).not.toBeNull()
    expect(priorities).not.toBeNull()

    const withProblems = useCase.mergeModuleResult(initial, 'problems', problems!)
    const withRetriedPriorities = useCase.mergeModuleResult(
      withProblems,
      'priorities',
      priorities!,
    )

    expect(withRetriedPriorities.problems[0].label).toBe('Chronic kidney disease')
    expect(withRetriedPriorities.headline).toBe('Complex cross-facility care')
  })
})

describe('medication education prompt contract', () => {
  const input = {
    clinicalContext: 'Medication: Metformin 500mg',
    catalog: [{ key: 'M1', resourceType: 'MedicationRequest', resourceId: 'med-1', display: 'Metformin 500mg' }],
    locale: 'en' as const,
  }

  it('asks the patient summary for benefit-first, non-alarming education', () => {
    const messages = useCase.buildMessages({ ...input, audience: 'patient' })
    expect(messages[0].content).toContain('Populate "medicationEducation" as benefit-first')
    expect(messages[0].content).toContain('Do NOT use fear-provoking labels')
    expect(messages[0].content).toContain('Never advise the patient to start, stop, skip, or change a dose')
  })

  it('keeps the clinician summary free of the patient education card', () => {
    const messages = useCase.buildMessages({ ...input, audience: 'medical' })
    expect(messages[0].content).toContain('Return "medicationEducation" as an empty array')
    expect(messages[0].content).toContain('Populate "medicationReview" as a concise clinician medication-reconciliation overview')
    expect(messages[0].content).toContain('NOT another safety card')
    expect(messages[0].content).toContain('cite its matching D# source key')
    expect(messages[0].content).toContain('does NOT prove that a specific procedure was performed')
  })

  it('asks for indication-grouped, clinically actionable medication reconciliation', () => {
    const messages = useCase.buildMessages({ ...input, audience: 'medical' })
    const prompt = messages[0].content

    expect(prompt).toContain('Group STRICTLY by indication or treatment area')
    expect(prompt).toContain('make "name" state the treatment pattern')
    expect(prompt).toContain('NEVER group by prescription batch, date, or facility')
    expect(prompt).toContain('Artificial tears / lubricants such as Patear are NOT pressure-lowering glaucoma therapy')
    expect(prompt).toContain('NEVER calculate or estimate a daily dose from dispensed quantity and supply days')
    expect(prompt).toContain('An EMPTY "changes" array is the correct answer for a stable regimen')
    expect(prompt).toContain('name the SPECIFIC medicine(s), the SPECIFIC record gap or conflict')
    expect(prompt).toContain('TWO different non-pharmacy institutions during overlapping supply periods')
    expect(prompt).toContain('Missing dose, route, or frequency ALONE is a known source-data limitation')
    expect(prompt).toContain('do not create a reconciliation item merely to ask how often')
    expect(prompt).toContain('A single completed historical chronic prescription is NOT enough')
    expect(prompt).toContain('at most ONE of "changes" or "reconciliation"')
  })

  it('uses exact same-row NHI terminology ahead of administrative categories', () => {
    const messages = useCase.buildMessages({ ...input, audience: 'medical' })
    const prompt = messages[0].content

    expect(prompt).toContain('NHI terminology matched to this exact medication record')
    expect(prompt).toContain('never transfer terminology between medication rows')
    expect(prompt).toContain('take precedence over MedicationRequest.category')
    expect(prompt).toContain('source/administrative metadata')
    expect(prompt).toContain('does NOT establish this patient\'s indication')
    expect(prompt).toContain('valid for EVERY medicine in that item')
    expect(prompt).toContain('Never copy a mechanism, expected effect, or adverse-effect reminder')

    const localPrompt = useCase.buildModuleMessages({
      ...input,
      audience: 'medical',
      harnessProfile: 'local-small',
    }, 'medications')[0].content
    expect(localPrompt).toContain('same-row NHI terminology block')
    expect(localPrompt).toContain('overrides a conflicting administrative MedicationRequest.category')
    expect(localPrompt).toContain('Never transfer terminology across rows')
    expect(localPrompt).toContain('one medicine cannot inherit another medicine\'s mechanism or adverse effects')
  })

  it('asks for cross-record medication insight beyond classification', () => {
    const messages = useCase.buildMessages({ ...input, audience: 'medical' })
    const prompt = messages[0].content

    // Bidirectional gap cross-check against the rest of the record.
    expect(prompt).toContain('"no-documented-indication"')
    // Orphan-drug check must consult the prescribing-visit context first
    // (the imipramine-at-a-BPH-visit false positive).
    expect(prompt).toContain('check the PRESCRIBING VISIT context')
    expect(prompt).toContain('not when the recorded context merely differs from the drug\'s best-known use')
    expect(prompt).toContain('"condition-without-therapy"')
    expect(prompt).toContain('cites the condition/lab keys instead of an M key')
    // condition-without-therapy is a record-anomaly check, never a
    // guideline-completeness prescribing suggestion (the CKD→ACEi/ARB misfire).
    expect(prompt).toContain('NEVER a prescribing suggestion')
    expect(prompt).toContain('an SGLT2 inhibitor already provides renal protection in CKD')
    expect(prompt).toContain('Guideline-completeness reminders')
    // Every reconciliation item must be anchored in this patient\'s records.
    expect(prompt).toContain('If an item could be written without looking at the records')
    // Same-institution sequential brand switches answer themselves — only
    // cross-institution / overlapping same-drug aliases are worth verifying.
    expect(prompt).toContain('Reason "possible-same-drug" is for REAL ambiguity only')
    expect(prompt).toContain('do NOT raise a reconciliation item for it')
    // Refill-regularity / adherence signal, phrased neutrally.
    expect(prompt).toContain('"adherence-pattern"')
    expect(prompt).toContain('never phrase it as non-adherence or blame')
    // Treatment-intensity pattern reading.
    expect(prompt).toContain('The pattern reading is the insight')
    // Pre/post-hospitalization regimen comparison.
    expect(prompt).toContain('compare the chronic regimen before and after')
    // One-glance overview synthesis, clinician-only.
    expect(prompt).toContain('For "overview"')
    expect(prompt).toContain('Omit "overview" for the patient audience')
  })

  it('keeps the patient summary free of the clinician medication review', () => {
    const messages = useCase.buildMessages({ ...input, audience: 'patient' })
    expect(messages[0].content).toContain('Return "medicationReview" with empty regimen, changes, and reconciliation arrays')
  })
})

describe('medical summary output-language contract', () => {
  it('places the English-only instruction around Chinese clinical source text', () => {
    const messages = useCase.buildMessages({
      clinicalContext: '近期診斷為肺炎，腎功能逐漸衰退。',
      catalog: [{
        key: 'E1',
        resourceType: 'Encounter',
        resourceId: 'enc-1',
        display: '肺炎住院',
      }],
      locale: 'en',
      audience: 'medical',
    })

    expect(messages[0].content.match(/OUTPUT LANGUAGE: ENGLISH ONLY/g)).toHaveLength(2)
    expect(messages[1].content.match(/OUTPUT LANGUAGE: ENGLISH ONLY/g)).toHaveLength(2)
    expect(messages[1].content).toContain('translate their meaning into natural English')
    expect(messages[1].content).toContain('must contain no Chinese Han characters')
  })

})

describe('finalizeResult', () => {
  const catalog = buildSourceCatalog(CATALOG_INPUT)

  it('verifies known keys, flags unknown keys, drops+counts bad timeline refs', () => {
    const ai = {
      headline: 'h',
      problems: [],
      summary: [
        { text: '於甲院追蹤', emphasis: true, sources: ['E1'] },
        { text: '（幻覺引用）', emphasis: false, sources: ['E99'] },
      ],
      decisions: [
        { text: '評估劑量', urgency: 'high' as const, rationale: 'eGFR 下降', sources: ['M1'] },
      ],
      timeline: [
        { ref: 'E1', label: '內分泌回診', category: 'encounter' },
        { ref: 'L1', label: 'HbA1c 檢驗', category: 'lab' },
        { ref: 'E3', label: '肺炎住院', category: 'encounter' },
        { ref: 'E99', label: '幻覺事件', category: 'encounter' },
      ],
    }
    const result = useCase.finalizeResult(ai, catalog)

    // Source index numbering follows first appearance; unknown key visible
    // but unverified — never silently dropped.
    expect(result.sourceIndex).toHaveLength(3)
    expect(result.sourceIndex[0]).toMatchObject({ key: 'E1', num: 1, verified: true, organization: '甲醫學中心' })
    expect(result.sourceIndex[1]).toMatchObject({ key: 'E99', num: 2, verified: false })
    expect(result.sourceIndex[2]).toMatchObject({ key: 'M1', num: 3, verified: true })

    // Timeline: hallucinated ref dropped and counted; rest sorted newest-first
    // with app-side dates/orgs.
    expect(result.droppedTimelineCount).toBe(1)
    expect(result.timeline.map((e) => e.key)).toEqual(['E1', 'L1', 'E3'])
    expect(result.timeline[0]).toMatchObject({ date: '2026-06-12', organization: '甲醫學中心' })
    // 住院 event keeps its bundle-derived subtype; AI could only say "encounter".
    expect(result.timeline[2]).toMatchObject({
      key: 'E3',
      endDate: '2026-03-16',
      encounterClass: 'inpatient',
    })
    expect(result.timeline[0].encounterClass).toBeUndefined()
  })

  it('drops exact duplicate timeline events but keeps distinct events from one source', () => {
    const ai = {
      headline: 'h',
      problems: [],
      summary: [{ text: 't', emphasis: false, sources: [] }],
      decisions: [],
      timeline: [
        { ref: 'E1', label: '住院接受治療', category: 'encounter' },
        { ref: 'E1', label: '住院接受治療', category: 'encounter' },
        { ref: 'E1', label: '出院後持續追蹤', category: 'followup' },
      ],
    }

    const result = useCase.finalizeResult(ai, catalog)

    expect(result.timeline).toHaveLength(2)
    expect(result.timeline.map((event) => event.label)).toEqual([
      '住院接受治療',
      '出院後持續追蹤',
    ])
    expect(result.timeline.map((event) => event.key)).toEqual(['E1', 'E1'])
  })

  it('resolves harmlessly reformatted citations to the canonical source key', () => {
    const ai = {
      headline: 'h',
      problems: [],
      summary: [{ text: '於甲院追蹤。', emphasis: false, sources: ['[ e 1 ]'] }],
      decisions: [],
      timeline: [],
    }

    const result = useCase.finalizeResult(ai, catalog)

    expect(result.summary[0].sourceKeys).toEqual(['E1'])
    expect(result.sourceIndex).toEqual([
      expect.objectContaining({ key: 'E1', verified: true }),
    ])
  })

  it('demotes over-long highlights and caps the emphasised count', () => {
    const seg = (text: string) => ({ text, emphasis: true, sources: [] })
    const ai = {
      headline: 'h',
      problems: [],
      summary: [
        seg('慢性腎臟病'), // short → kept
        seg('本病患為94歲男性，既往病史包含多發性骨髓瘤、第二型糖尿病與慢性腎臟病，近期多次因呼吸道症狀就診。'), // whole sentence → demoted
        seg('HbA1c 7.2→8.4'), // short → kept
        seg('貧血'),
        seg('低血磷'),
        seg('心臟擴大'), // 5th short one → kept (budget = 5)
        seg('肺浸潤'), // 6th → demoted by count cap
      ],
      decisions: [],
      timeline: [],
    }
    const result = useCase.finalizeResult(ai, catalog)
    expect(result.summary.map((s) => s.emphasis)).toEqual([
      true, false, true, true, true, true, false,
    ])
  })

  it('resolves problem sources, normalises kind, and numbers before decisions', () => {
    const ai = {
      headline: 'h',
      summary: [{ text: 't', emphasis: false, sources: [] }],
      problems: [
        { label: '第2型糖尿病', basis: '就診申報', kind: 'diagnosis', sources: ['C1'] },
        { label: '貧血', basis: '5 次檢驗異常', kind: 'lab', sources: ['L1', 'L99'] },
        { label: '未知類別', kind: 'weird', sources: [] },
      ],
      decisions: [
        { text: '評估劑量', urgency: 'high' as const, rationale: 'x', sources: ['M1'] },
      ],
      timeline: [],
    }
    const result = useCase.finalizeResult(ai, catalog)
    expect(result.problems[0]).toMatchObject({ label: '第2型糖尿病', kind: 'diagnosis', sourceKeys: ['C1'] })
    // Verified + hallucinated key both kept as sourceKeys (SourceSup flags unverified).
    expect(result.problems[1].sourceKeys).toEqual(['L1', 'L99'])
    // Off-list kind → 'other'; missing basis → undefined.
    expect(result.problems[2]).toMatchObject({ kind: 'other', basis: undefined })
    // Problem sources joined the shared sourceIndex (navigable via byKey).
    expect(result.sourceIndex.some((s) => s.key === 'C1' && s.verified)).toBe(true)
    expect(result.sourceIndex.some((s) => s.key === 'L99' && !s.verified)).toBe(true)
    // Numbering follows RENDER order: problems (card above) number before
    // decisions, so superscripts increase top-to-bottom on the page.
    const num = (key: string) => result.sourceIndex.find((s) => s.key === key)!.num
    expect(num('C1')).toBeLessThan(num('M1'))
  })

  it('finalizes disease-oriented investigation trends before problem sources', () => {
    const investigationCatalog = [
      ...catalog,
      { key: 'L2', resourceType: 'DiagnosticReport', resourceId: 'lab-2', display: 'HbA1c', date: '2025-06-01' },
    ]
    const ai = {
      headline: 'h',
      summary: [{ text: 't', emphasis: false, sources: [] }],
      investigations: [
        {
          label: 'HbA1c',
          kind: 'lab',
          direction: 'worsening',
          trend: '6.8% → 7.2% → 7.9% → 8.4%',
          interpretation: '血糖控制變差',
          sources: ['L1', 'L2', 'L99'],
        },
        {
          label: '未知類型',
          kind: 'unsupported',
          direction: 'sideways',
          trend: '單次結果',
          interpretation: '資料不足',
          sources: [],
        },
      ],
      problems: [{ label: '第2型糖尿病', kind: 'diagnosis', sources: ['C1'] }],
      decisions: [],
      timeline: [],
    }
    const result = useCase.finalizeResult(ai, investigationCatalog)
    expect(result.investigations[0]).toMatchObject({
      kind: 'lab',
      direction: 'worsening',
      trend: '7.2% → 7.9% → 8.4%',
      sourceKeys: ['L1', 'L2', 'L99'],
    })
    expect(result.investigations[1]).toMatchObject({ kind: 'other', direction: 'unknown' })
    expect(result.sourceIndex.find((source) => source.key === 'L99')).toMatchObject({ verified: false })
    const num = (key: string) => result.sourceIndex.find((source) => source.key === key)!.num
    expect(num('L1')).toBeLessThan(num('C1'))
  })

  it('guards against a single-result badge when cited investigation sources span multiple dates', () => {
    const serialCatalog = buildSourceCatalog({
      diagnosticReports: [
        { id: 'rep-new', code: { text: 'HbA1c' }, effectiveDateTime: '2026-06-02' },
        { id: 'rep-old', code: { text: 'HbA1c' }, effectiveDateTime: '2025-12-09' },
        { id: 'cxr-new', code: { text: '胸腔檢查' }, effectiveDateTime: '2026-06-02' },
        { id: 'cxr-old', code: { text: '胸腔檢查' }, effectiveDateTime: '2026-05-25' },
      ],
    })
    const ai = {
      headline: 'h',
      summary: [{ text: 't', emphasis: false, sources: [] }],
      investigations: [
        {
          label: 'HbA1c',
          kind: 'lab',
          direction: 'single',
          trend: '6.7% → 6.6%',
          interpretation: '模型誤回單次結果',
          sources: ['L1', 'L2'],
        },
      ],
      problems: [],
      decisions: [],
      timeline: [],
    }
    const result = useCase.finalizeResult(ai, serialCatalog)
    expect(result.investigations[0].direction).toBe('unknown')
  })

  it('strictly blocks single-point control claims and medication-only diagnoses', () => {
    const strictCatalog = [
      {
        key: 'L1',
        resourceType: 'DiagnosticReport',
        resourceId: 'lab-1',
        display: 'HbA1c 8.2%',
        date: '2026-06-18',
        supportsNormalityAssessment: false,
      },
      {
        key: 'M1',
        resourceType: 'MedicationRequest',
        resourceId: 'med-1',
        display: 'Atorvastatin 20 mg QHS',
        date: '2026-06-18',
      },
    ]
    const ai = {
      headline: '跨院追蹤，近期血糖控制不佳。',
      summary: [
        { text: 'HbA1c 8.2%。', emphasis: true, sources: ['L1'] },
        { text: '顯示血糖控制未達標。', emphasis: false, sources: [] },
      ],
      investigations: [{
        label: 'HbA1c',
        kind: 'lab',
        direction: 'worsening',
        trend: 'HbA1c 8.2%',
        interpretation: '數值偏高，血糖控制不佳，需評估用藥調整。',
        sources: ['L1'],
      }],
      medicationEducation: [],
      medicationReview: { regimen: [], changes: [], reconciliation: [] },
      problems: [
        { label: '血糖控制不佳', basis: 'HbA1c 8.2%', kind: 'lab', sources: ['L1'] },
        { label: '高脂血症', basis: 'Atorvastatin 處方', kind: 'medication', sources: ['M1'] },
      ],
      decisions: [],
      timeline: [],
    }

    const result = useCase.finalizeResult(ai, strictCatalog, {
      locale: 'zh-TW',
      strictGrounding: true,
    })

    expect(result.headline).toBe('跨院追蹤')
    expect(result.summary.map((segment) => segment.text).join('')).toBe('HbA1c 8.2%。')
    expect(result.investigations[0]).toMatchObject({
      direction: 'single',
      interpretation: '這是紀錄中的檢驗結果；資料未提供參考範圍或個人目標。',
    })
    expect(result.problems).toEqual([])
  })

  it('strictly grounds patient medication education and uses a generic reminder', () => {
    const ai = {
      headline: '用藥摘要',
      summary: [{ text: '有 Amlodipine 用藥紀錄。', emphasis: false, sources: ['M1'] }],
      investigations: [],
      medicationEducation: [{
        name: 'Amlodipine 5 mg QD',
        benefit: '幫助控制血壓，維持心血管健康。',
        attention: '若頭暈或腳踝腫脹請就醫。',
        sources: ['M1'],
      }],
      medicationReview: { regimen: [], changes: [], reconciliation: [] },
      problems: [],
      decisions: [],
      timeline: [],
    }
    const result = useCase.finalizeResult(ai, [{
      key: 'M1',
      resourceType: 'MedicationRequest',
      resourceId: 'med-1',
      display: 'Amlodipine 5 mg QD',
      date: '2026-06-20',
    }], {
      audience: 'patient',
      locale: 'zh-TW',
      strictGrounding: true,
    })

    expect(result.medicationEducation[0]).toMatchObject({
      benefit: '紀錄中有此藥物；實際用途請向醫師或藥師確認。',
      attention: '請依醫囑使用；若有不適或疑問，請詢問醫師或藥師。',
    })
  })

  it('guards against a single-result badge when the catalog has serial reports for the same topic', () => {
    const serialCatalog = buildSourceCatalog({
      diagnosticReports: [
        { id: 'rep-new', code: { text: 'HbA1c' }, effectiveDateTime: '2026-06-02' },
        { id: 'rep-old', code: { text: 'HbA1c' }, effectiveDateTime: '2025-12-09' },
        { id: 'cxr-new', code: { text: '胸腔檢查' }, effectiveDateTime: '2026-06-02' },
        { id: 'cxr-old', code: { text: '胸腔檢查' }, effectiveDateTime: '2026-05-25' },
      ],
    })
    const ai = {
      headline: 'h',
      summary: [{ text: 't', emphasis: false, sources: [] }],
      investigations: [
        {
          label: '血糖與糖化血色素',
          kind: 'lab',
          direction: 'single',
          trend: 'HbA1c: 6.6% (2026/06/02)',
          interpretation: '模型只引用最新一筆，但 catalog 其實有序列',
          sources: ['L1'],
        },
        {
          label: '胸腔影像檢查',
          kind: 'imaging',
          direction: 'single',
          trend: '2026/06/02 影像顯示心臟輕微擴大',
          interpretation: '模型只引用最新一筆胸片，但 catalog 其實有序列',
          sources: ['L1'],
        },
      ],
      problems: [],
      decisions: [],
      timeline: [],
    }
    const result = useCase.finalizeResult(ai, serialCatalog)
    expect(result.investigations[0].direction).toBe('unknown')
    expect(result.investigations[1].direction).toBe('unknown')
  })

  it('finalizes medication education and numbers it before problem sources', () => {
    const ai = {
      headline: 'h',
      summary: [{ text: 't', emphasis: false, sources: [] }],
      investigations: [],
      medicationEducation: [
        {
          name: 'Metformin',
          benefit: '協助控制血糖',
          attention: '依醫囑使用，有疑問可詢問醫師或藥師',
          sources: ['M1', 'M99'],
        },
        {
          name: '沒有用藥紀錄支持的項目',
          benefit: '不應顯示',
          attention: '不應顯示',
          sources: ['C1'],
        },
      ],
      problems: [{ label: '第2型糖尿病', kind: 'diagnosis', sources: ['C1'] }],
      decisions: [],
      timeline: [],
    }
    const result = useCase.finalizeResult(ai, catalog)
    expect(result.medicationEducation).toHaveLength(1)
    expect(result.medicationEducation[0]).toMatchObject({
      name: 'Metformin',
      benefit: '協助控制血糖',
      attention: '依醫囑使用，有疑問可詢問醫師或藥師',
      sourceKeys: ['M1', 'M99'],
    })
    expect(result.sourceIndex.find((source) => source.key === 'M99')).toMatchObject({ verified: false })
    const num = (key: string) => result.sourceIndex.find((source) => source.key === key)!.num
    expect(num('M1')).toBeLessThan(num('C1'))
  })

  it('finalizes clinician medication review, normalizes labels, and drops uncited items', () => {
    const ai = {
      headline: 'h',
      summary: [{ text: 't', emphasis: false, sources: [] }],
      investigations: [],
      medicationReview: {
        regimen: [
          { group: '糖尿病', name: 'Metformin', sig: 'BID', sources: ['M1'] },
          { group: '心臟', name: '不存在的藥', sources: ['C1'] },
        ],
        changes: [
          { type: 'cross-facility', medication: 'Metformin', summary: '跨院記錄', sources: ['M1'] },
          { type: 'invented', medication: 'Metformin', summary: '待確認', sources: ['M1'] },
        ],
        reconciliation: [
          { reason: 'missing-sig', text: '需確認用法', sources: ['M1'] },
          { reason: 'invented', text: '其他待確認', sources: ['M1'] },
        ],
      },
      problems: [{ label: '第2型糖尿病', kind: 'diagnosis', sources: ['C1'] }],
      decisions: [],
      timeline: [],
    }
    const result = useCase.finalizeResult(ai, catalog)
    expect(result.medicationReview.regimen).toHaveLength(1)
    expect(result.medicationReview.changes.map((item) => item.type)).toEqual(['cross-facility', 'uncertain'])
    expect(result.medicationReview.reconciliation.map((item) => item.reason)).toEqual(['other'])
    const num = (key: string) => result.sourceIndex.find((source) => source.key === key)!.num
    expect(num('M1')).toBeLessThan(num('C1'))
  })

  it('preserves the model medication group so terminology mistakes remain visible', () => {
    const medications = [{
      id: 'betmiga',
      status: 'active',
      authoredOn: '2026-07-01',
      medicationCodeableConcept: {
        coding: [{
          system: 'https://twcore.mohw.gov.tw/CodeSystem/nhi-drug-code',
          code: 'BC26216100',
          display: 'Betmiga Prolonged-release Tablets 50mg',
        }],
      },
      // Deliberately conflicting source/administrative label.
      category: [{ text: '抗膽鹼藥物', coding: [{ display: 'ANTICHOLINERGICS' }] }],
      drugTerminology: {
        source: 'nhi-official-drug-master' as const,
        snapshotId: 'nhi-drug-terminology-20260728',
        ingredientText: 'Mirabegron 50 MG',
        atcCode: 'G04BD12',
        atcNameEn: 'mirabegron',
        atcLevel2Code: 'G04',
        atcLevel2NameZh: '泌尿系統用藥',
        atcLevel2NameEn: 'UROLOGICALS',
      },
    }]
    const medicationCatalog = buildSourceCatalog({ medications })
    const ai = {
      headline: 'h',
      summary: [{ text: 't', emphasis: false, sources: [] }],
      medicationReview: {
        regimen: [{
          group: '抗膽鹼藥物',
          name: 'Betmiga Prolonged-release Tablets 50mg',
          sources: ['M1'],
        }],
        changes: [],
        reconciliation: [],
      },
      problems: [],
      decisions: [],
      timeline: [],
    }

    const result = useCase.finalizeResult(ai, medicationCatalog, {
      clinicalData: { medications },
      audience: 'medical',
      locale: 'zh-TW',
      strictGrounding: false,
    })

    expect(result.medicationReview.regimen[0]).toMatchObject({
      group: '抗膽鹼藥物',
      name: 'Betmiga Prolonged-release Tablets 50mg',
    })

    const treatmentAreaResult = useCase.finalizeResult({
      ...ai,
      medicationReview: {
        ...ai.medicationReview,
        regimen: [{
          group: '攝護腺／膀胱',
          name: 'Betmiga Prolonged-release Tablets 50mg',
          sources: ['M1'],
        }],
      },
    }, medicationCatalog, {
      clinicalData: { medications },
      audience: 'medical',
      locale: 'zh-TW',
      strictGrounding: false,
    })
    expect(treatmentAreaResult.medicationReview.regimen[0].group)
      .toBe('攝護腺／膀胱')

    const strictResult = useCase.finalizeResult(ai, medicationCatalog, {
      clinicalData: { medications },
      audience: 'medical',
      locale: 'zh-TW',
      strictGrounding: true,
    })
    expect(strictResult.medicationReview.regimen[0].group)
      .toBe('抗膽鹼藥物')
  })

  it('passes the clinician overview through and grounds condition-without-therapy on condition/lab keys', () => {
    const ai = {
      headline: 'h',
      summary: [{ text: 't', emphasis: false, sources: [] }],
      investigations: [],
      medicationReview: {
        overview: '長期用藥 1 種，由單一院所處方，續領規律。',
        regimen: [{ group: '糖尿病', name: 'Metformin', sources: ['M1'] }],
        changes: [],
        reconciliation: [
          // Flags an ABSENT medicine — no M key exists, condition evidence grounds it.
          { reason: 'condition-without-therapy', text: '糖尿病診斷但現行慢箋未見降血糖藥——確認是否自費或他院', sources: ['C1'] },
          // Any other reason still requires a real Medication record.
          { reason: 'uncertain-current', text: '沒有用藥紀錄佐證的待確認', sources: ['C1'] },
          // condition-without-therapy citing only an invented key stays dropped.
          { reason: 'condition-without-therapy', text: '引用不存在來源的項目', sources: ['C99'] },
        ],
      },
      problems: [],
      decisions: [],
      timeline: [],
    }
    const result = useCase.finalizeResult(ai, catalog)
    expect(result.medicationReview.overview).toBe('長期用藥 1 種，由單一院所處方，續領規律。')
    expect(result.medicationReview.reconciliation).toEqual([
      expect.objectContaining({
        reason: 'condition-without-therapy',
        sourceKeys: ['C1'],
      }),
    ])
  })

  it('strips regimen sigs that are dispensing arithmetic rewrites or filler', () => {
    const medications = [{
      id: 'forxiga-arithmetic',
      status: 'active',
      authoredOn: '2026-06-25',
      medicationCodeableConcept: {
        coding: [{ system: 'nhi', code: 'BC26476100', display: 'Forxiga Film-coated Tablets 10mg' }],
      },
      category: [{ text: '抗糖尿病藥物' }],
      // The ONLY recorded dosage line is dispensing arithmetic — any sig the
      // model writes for this drug is derived, not recorded.
      dosageInstruction: [{ text: '給藥總量 28，給藥日數 28 天（平均每日 1）' }],
    }, {
      id: 'eltroxin-real-sig',
      status: 'active',
      authoredOn: '2026-06-25',
      medicationCodeableConcept: {
        coding: [{ system: 'nhi', code: 'BC24708100', display: 'Eltroxin Tablets 100mcg' }],
      },
      category: [{ text: '甲狀腺' }],
      dosageInstruction: [{ text: '每日1次，每次1錠，飯前服用' }],
    }]
    const medicationCatalog = buildSourceCatalog({ medications })
    const ai = {
      headline: 'h',
      summary: [{ text: 't', emphasis: false, sources: [] }],
      medicationReview: {
        regimen: [
          { group: '血糖', name: 'Forxiga', sig: '每日一次', sources: ['M1'] },
          { group: '甲狀腺', name: 'Eltroxin', sig: '每日1次，每次1錠', sources: ['M2'] },
          { group: '排便', name: 'Sennosides', sig: '依醫囑服用', sources: ['M1'] },
        ],
        changes: [],
        reconciliation: [],
      },
      problems: [],
      decisions: [],
      timeline: [],
    }
    const result = useCase.finalizeResult(ai, medicationCatalog, {
      clinicalData: { medications },
      audience: 'medical',
      locale: 'zh-TW',
    })
    const sigs = Object.fromEntries(result.medicationReview.regimen.map((r) => [r.name, r.sig]))
    expect(sigs['Forxiga']).toBeUndefined()          // derived from arithmetic → stripped
    expect(sigs['Eltroxin']).toBe('每日1次，每次1錠') // real recorded instruction → kept
    expect(sigs['Sennosides']).toBeUndefined()       // filler → stripped
  })

  it('flags problem citations whose report type contradicts the stated basis', () => {
    const diagnosticReports = [
      {
        id: 'rep-cxr',
        code: { text: '胸腔檢查（包括各種角度部位之胸腔檢查）' },
        effectiveDateTime: '2026-06-14',
        performer: [{ display: '林口長庚' }],
      },
      {
        id: 'rep-ecg',
        code: { text: '心電圖' },
        effectiveDateTime: '2026-06-14',
        performer: [{ display: '林口長庚' }],
      },
      {
        id: 'rep-hba1c',
        code: { text: 'HbA1c' },
        effectiveDateTime: '2026-06-01',
      },
    ]
    const reportCatalog = buildSourceCatalog({ diagnosticReports })
    const key = (id: string) => reportCatalog.find((c) => c.resourceId === id)!.key
    const ai = {
      headline: 'h',
      summary: [{ text: 't', emphasis: false, sources: [] }],
      problems: [
        // 心電圖 basis citing a chest X-ray → that key flagged, ECG key clean.
        { label: '右側束枝傳導阻斷 (RBBB)', basis: '心電圖紀錄', kind: 'diagnosis', sources: [key('rep-cxr'), key('rep-ecg')] },
        // Basis type matches the cited report → no flag.
        { label: '心律異常', basis: '心電圖紀錄', kind: 'diagnosis', sources: [key('rep-ecg')] },
        // Unclassifiable basis / report never triggers (conservative).
        { label: '第2型糖尿病', basis: '3 次檢驗異常', kind: 'lab', sources: [key('rep-hba1c')] },
      ],
      decisions: [],
      timeline: [],
    }
    const result = useCase.finalizeResult(ai, reportCatalog)
    expect(result.problems[0].suspectSourceKeys).toEqual([key('rep-cxr')])
    expect(result.problems[0].sourceKeys).toContain(key('rep-cxr')) // shown, not hidden
    expect(result.problems[1].suspectSourceKeys).toBeUndefined()
    expect(result.problems[2].suspectSourceKeys).toBeUndefined()
  })

  it('drops the medication-review overview for the patient audience', () => {
    const ai = {
      headline: 'h',
      summary: [{ text: 't', emphasis: false, sources: [] }],
      investigations: [],
      medicationReview: {
        overview: '不應出現在民眾版的綜合判讀。',
        regimen: [],
        changes: [],
        reconciliation: [],
      },
      problems: [],
      decisions: [],
      timeline: [],
    }
    const result = useCase.finalizeResult(ai, catalog, { audience: 'patient' })
    expect(result.medicationReview.overview).toBeUndefined()
  })

  it('removes an unsupported medication overview when every cited row is invalid', () => {
    const ai = {
      headline: 'h',
      summary: [{ text: 't', emphasis: false, sources: [] }],
      medicationReview: {
        overview: '病人目前使用 Captopril。',
        regimen: [{ group: '心血管', name: 'Captopril', sources: ['M99'] }],
        changes: [],
        reconciliation: [],
      },
      problems: [],
      decisions: [],
      timeline: [],
    }

    const result = useCase.finalizeResult(ai, catalog, { audience: 'medical' })

    expect(result.medicationReview).toEqual({
      overview: undefined,
      regimen: [],
      changes: [],
      reconciliation: [],
    })
  })

  it('deterministically lists every chronic drug and merges its cross-facility records', () => {
    const medications = [
      {
        id: 'forxiga-current',
        status: 'active',
        authoredOn: '2026-06-25',
        medicationCodeableConcept: {
          text: '福適佳膜衣錠10毫克',
          coding: [{
            system: 'nhi',
            code: 'BC26476100',
            display: 'Forxiga Film-coated Tablets 10mg',
          }],
        },
        category: [{ text: '抗糖尿病藥物', coding: [{ display: 'ANTIDIABETIC AGENTS' }] }],
        requester: { display: '示範康健藥局' },
        dosageInstruction: [{ text: '給藥總量 28，給藥日數 28 天（平均每日 1）' }],
      },
      {
        id: 'forxiga-chronic',
        status: 'completed',
        authoredOn: '2026-04-28',
        medicationCodeableConcept: {
          text: '福適佳膜衣錠10毫克',
          coding: [{
            system: 'nhi',
            code: 'BC26476100',
            display: 'Forxiga Film-coated Tablets 10mg',
          }],
        },
        courseOfTherapyType: { coding: [{ code: 'continuous' }] },
        category: [{ text: '抗糖尿病藥物', coding: [{ display: 'ANTIDIABETIC AGENTS' }] }],
        requester: { display: '示範向陽藥局' },
        dosageInstruction: [{ text: '給藥總量 28，給藥日數 28 天（平均每日 1）' }],
      },
      {
        id: 'acute-only',
        authoredOn: '2026-06-20',
        medicationCodeableConcept: {
          coding: [{ system: 'nhi', code: 'ACUTE', display: 'Acute medicine' }],
        },
      },
    ]
    const medicationCatalog = buildSourceCatalog({ medications })
    const ai = {
      headline: 'h',
      summary: [{ text: 't', emphasis: false, sources: [] }],
      medicationReview: { regimen: [], changes: [], reconciliation: [] },
      problems: [{ label: '慢性腎臟病', kind: 'diagnosis', sources: [] }],
      decisions: [],
      timeline: [],
    }

    const result = useCase.finalizeResult(ai, medicationCatalog, {
      clinicalData: { medications },
      audience: 'medical',
      locale: 'zh-TW',
    })

    expect(result.medicationReview.regimen).toHaveLength(1)
    expect(result.medicationReview.regimen[0]).toMatchObject({
      group: '抗糖尿病藥物',
      name: 'Forxiga Film-coated Tablets 10mg',
      sig: undefined,
    })
    const sourceIds = result.medicationReview.regimen[0].sourceKeys.map(
      (key) => medicationCatalog.find((source) => source.key === key)?.resourceId,
    )
    expect(sourceIds).toEqual(['forxiga-current', 'forxiga-chronic'])
    expect(result.sourceIndex.filter((source) => source.resourceType?.startsWith('Medication')))
      .toHaveLength(2)
  })

  it('removes a completed-only historical chronic medicine from the current regimen', () => {
    const medications = [{
      id: 'historical-uretropic',
      status: 'completed',
      authoredOn: '2026-04-25',
      medicationCodeableConcept: {
        coding: [{ system: 'nhi', code: 'AC010471G0', display: 'URETROPIC TABLETS' }],
      },
      courseOfTherapyType: { coding: [{ code: 'continuous' }] },
      category: [{ text: '利尿劑' }],
    }]
    const medicationCatalog = buildSourceCatalog({ medications })
    const ai = {
      headline: 'h',
      summary: [{ text: 't', emphasis: false, sources: [] }],
      medicationReview: {
        regimen: [{ group: '利尿劑慢箋', name: 'URETROPIC TABLETS', sources: ['M1'] }],
        changes: [],
        reconciliation: [],
      },
      problems: [],
      decisions: [],
      timeline: [],
    }

    const result = useCase.finalizeResult(ai, medicationCatalog, {
      clinicalData: { medications },
      audience: 'medical',
      locale: 'zh-TW',
    })

    expect(result.medicationReview.regimen).toEqual([])
  })

  it('keeps the latest demo Forxiga while excluding completed-only Uretropic history', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bundle = require('../../../public/demo/demo-bundle.json')
    const parsedData = LocalBundleService.parse(bundle)
    expect(parsedData).not.toBeNull()
    const includedDocumentIds = resolveSelectedDocuments(
      listClinicalDocuments(parsedData!.collection),
      'latestAdmission',
      [],
    ).map((document) => document.id)
    const scopedClinicalData = scopeClinicalDataForAi(
      parsedData!.collection,
      DEFAULT_DATA_SELECTION,
      DEFAULT_DATA_FILTERS,
      includedDocumentIds,
      clinicalNowMs(true),
    )
    const demoCatalog = getSourceCatalog(scopedClinicalData, 'zh-TW')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { demoMedicalSummarySnapshots } = require('../../../src/infrastructure/demo/demo-ai-snapshots')
    const parsed = useCase.parseResult(JSON.stringify(demoMedicalSummarySnapshots['zh-TW'].medical))
    expect(parsed).not.toBeNull()

    const result = useCase.finalizeResult(parsed!, demoCatalog, {
      clinicalData: scopedClinicalData,
      audience: 'medical',
      locale: 'zh-TW',
    })
    expect(result.medicationReview.regimen.length).toBeGreaterThan(0)
    expect(result.medicationReview.regimen.length).toBeLessThanOrEqual(8)
    const forxiga = result.medicationReview.regimen.find(
      (item) => item.name.includes('Forxiga'),
    )

    expect(forxiga).toMatchObject({ name: expect.stringContaining('Forxiga'), sig: undefined })
    expect(result.medicationReview.regimen.some((item) => item.group === '同次慢箋')).toBe(false)
    expect(result.medicationReview.regimen.find((item) => item.name.includes('PATEAR')))
      .toMatchObject({ group: '眼科' })
    expect(result.medicationReview.regimen.some((item) => item.name.includes('URETROPIC'))).toBe(false)
    expect(result.medicationReview.changes).toEqual([])
    expect(result.medicationReview.regimen.find((item) => item.group === '眼科')?.name)
      .toContain('Brimonin')
    // Exactly ONE reconciliation item survives the quality bar. The current
    // data contain two 30-day Aricept dispensings 22 days apart, so the useful
    // action is to distinguish an early refill from duplicate supply.
    expect(result.medicationReview.reconciliation).toEqual([
      expect.objectContaining({
        reason: 'possible-same-drug',
        text: expect.stringContaining('Aricept 5mg'),
        sourceKeys: ['M5', 'M11'],
      }),
    ])
    const citedSources = forxiga?.sourceKeys.map(
      (key) => demoCatalog.find((source) => source.key === key),
    ) ?? []
    const forxigaMedications = (scopedClinicalData.medications ?? []).filter((medication) =>
      medication.medicationCodeableConcept?.coding?.some((coding) =>
        coding.display?.includes('Forxiga'),
      ),
    )
    const latestForxiga = [...forxigaMedications]
      .sort((a, b) => (b.authoredOn ?? '').localeCompare(a.authoredOn ?? ''))[0]

    expect(citedSources).not.toContain(undefined)
    expect(citedSources.map((source) => source?.resourceId)).toContain(latestForxiga?.id)
  })

  it('rescues quoted key phrases when zero highlights survive', () => {
    const ai = {
      headline: 'h',
      problems: [],
      summary: [
        {
          // One long segment, model quoted its key phrases instead of splitting
          // — the guardrail demotes it (too long), then the rescue harvests 「」.
          text: '近期診斷為「肺炎」伴隨慢性咳嗽，追蹤顯示「eGFR 32」之慢性腎病，需持續監測。',
          emphasis: true,
          sources: ['E1', 'L1'],
        },
      ],
      decisions: [],
      timeline: [],
    }
    const result = useCase.finalizeResult(ai, catalog)
    expect(result.summary.map((s) => [s.text, s.emphasis])).toEqual([
      ['近期診斷為', false],
      ['肺炎', true],
      ['伴隨慢性咳嗽，追蹤顯示', false],
      ['eGFR 32', true],
      ['之慢性腎病，需持續監測。', false],
    ])
    // Sources stay on the segment's last piece → superscript position unchanged.
    expect(result.summary[4].sourceKeys).toEqual(['E1', 'L1'])
    expect(result.summary.slice(0, 4).every((s) => s.sourceKeys.length === 0)).toBe(true)
  })

  it('does not rewrite quotes when compliant highlights exist', () => {
    const ai = {
      headline: 'h',
      problems: [],
      summary: [
        { text: '肺炎', emphasis: true, sources: [] },
        { text: '病史包含「多發性骨髓瘤」等。', emphasis: false, sources: [] },
      ],
      decisions: [],
      timeline: [],
    }
    const result = useCase.finalizeResult(ai, catalog)
    expect(result.summary).toHaveLength(2)
    expect(result.summary[1].text).toContain('「多發性骨髓瘤」')
  })

  it('coalesces fragment citations onto the claim they support', () => {
    const ai = {
      headline: 'h',
      problems: [],
      summary: [
        // Fragment with its own citation — must NOT render a mid-sentence sup.
        { text: '本病患具有複雜病史，包含', emphasis: false, sources: ['E1'] },
        // The claim: fragment's citation merges here, duplicates deduped.
        { text: '慢性腎臟病', emphasis: true, sources: ['E1', 'L1'] },
        // Trailing fragment ends the sentence with no own sources → no sup.
        { text: '，伴隨高血壓。', emphasis: false, sources: [] },
        // New sentence, cited but no highlight → sup lands at sentence end.
        { text: '影像顯示雙側肺部浸潤。', emphasis: false, sources: ['M1'] },
      ],
      decisions: [],
      timeline: [],
    }
    const result = useCase.finalizeResult(ai, catalog)
    expect(result.summary.map((s) => s.sourceKeys)).toEqual([
      [],
      ['E1', 'L1'],
      [],
      ['M1'],
    ])
  })

  it('coerces an off-list timeline category', () => {
    const ai = {
      headline: 'h',
      problems: [],
      summary: [{ text: 't', emphasis: false, sources: [] }],
      decisions: [],
      timeline: [{ ref: 'E1', label: 'x', category: 'weird-category' }],
    }
    const result = useCase.finalizeResult(ai, catalog)
    expect(result.timeline[0].category).toBe('encounter')
  })
})
