// Medical Summary use-case tests — the anti-hallucination contract:
// citations resolve against the app-built catalog; unknown keys stay visible
// as unverified; timeline picks with unknown refs are dropped AND counted.
import {
  GenerateMedicalSummaryUseCase,
  buildSourceCatalog,
  buildCoverageStats,
  buildLongitudinalInvestigationContext,
  scopeDocumentSources,
  classifyEncounterClass,
  normaliseSummarySourceKey,
} from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'
import { verifyDocumentQuote } from '@/src/core/utils/document-evidence.utils'
import {
  MEDICAL_SUMMARY_CARD_REGISTRY,
  registeredMedicalSummaryCards,
} from '@/src/core/use-cases/medical-summary/medical-summary-card-registry'

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

  it('joins a newer shared echo narrative to an older singleton without losing any source', () => {
    const report = (
      id: string,
      date: string,
      code: string,
      title: string,
      conclusion: string,
    ) => ({
      id,
      status: 'final',
      subject: { reference: 'Patient/p-1' },
      encounter: { reference: `Encounter/e-${date}` },
      category: [{ text: 'Radiology' }],
      code: { text: title, coding: [{ code }] },
      effectiveDateTime: date,
      performer: [{ display: '甲醫學中心' }],
      conclusion,
    })
    const newFinding = 'LVEF 63%. Mild mitral regurgitation.'
    const oldFinding = 'LVEF 58%. Mild mitral regurgitation.'
    const input = {
      diagnosticReports: [
        report('new-2d', '2026-06-05', '18005C', '2D echocardiography', newFinding),
        report('new-doppler', '2026-06-05', '18007C', 'Doppler echocardiography', newFinding),
        report('old-2d', '2025-11-12', '18005C', '2D echocardiography', oldFinding),
      ],
    }
    const catalog = buildSourceCatalog(input as never)
    const context = buildLongitudinalInvestigationContext(input as never, catalog)

    expect(catalog.filter((source) => source.resourceType === 'DiagnosticReport')).toHaveLength(3)
    expect(context.match(/LVEF 63%\. Mild mitral regurgitation\./g)).toHaveLength(1)
    expect(context.match(/LVEF 58%\. Mild mitral regurgitation\./g)).toHaveLength(1)
    expect(context).toContain('2025-11-12; L3: LVEF 58%')
    expect(context).toContain('2026-06-05; L1 2D echocardiography')
    expect(context).toContain('L1 2D echocardiography [codes: 18005C] [id: new-2d]')
    expect(context).toContain('L2 Doppler echocardiography [codes: 18007C] [id: new-doppler]')
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

// ---------------------------------------------------------------------------
// 初診快覽 modules: overview / focus / problems / recent
// ---------------------------------------------------------------------------

const VALID_AI_RESULT = {
  headline: '多重慢性病男性：CKD 3b 與第二型糖尿病分由兩院追蹤。',
  mustKnow: [
    {
      slot: 'renal',
      label: 'eGFR 32',
      text: 'eGFR 33 → 32，經腎排除藥物依此劑量。',
      critical: true,
      sources: ['L1'],
    },
  ],
  medicationEducation: [],
  focus: [
    {
      title: '腎功能持續下降',
      text: 'eGFR 33 → 32（2026-04-18）。',
      sources: ['L1'],
    },
  ],
  problems: [
    { label: '第2型糖尿病', basis: '照護計畫', kind: 'careplan', sources: ['C1'] },
  ],
  recent: [
    { ref: 'E1', label: '內分泌科門診', category: 'encounter' },
  ],
}

describe('parseResult', () => {
  it('parses a valid reply wrapped in markdown fences', () => {
    const parsed = useCase.parseResult(
      '```json\n' + JSON.stringify(VALID_AI_RESULT) + '\n```',
    )
    expect(parsed).not.toBeNull()
    expect(parsed!.headline).toContain('CKD 3b')
    expect(parsed!.mustKnow).toHaveLength(1)
    expect(parsed!.focus).toHaveLength(1)
    expect(parsed!.recent[0].ref).toBe('E1')
  })

  it('rejects malformed / off-schema replies', () => {
    expect(useCase.parseResult('not json')).toBeNull()
    // headline is required; a reply without it is not a summary.
    expect(useCase.parseResult(JSON.stringify({ focus: [] }))).toBeNull()
    // Wrong TYPES still reject — only oversize content clamps.
    expect(useCase.parseResult(JSON.stringify({
      ...VALID_AI_RESULT,
      problems: [{ label: 1, sources: ['C1'] }],
    }))).toBeNull()
  })

  it('clamps oversize-but-valid replies instead of rejecting them', () => {
    const parsed = useCase.parseResult(JSON.stringify({
      ...VALID_AI_RESULT,
      headline: 'x'.repeat(400),
      mustKnow: Array.from({ length: 12 }, () => ({
        slot: 'other',
        label: 'y'.repeat(80),
        text: 'z'.repeat(400),
        sources: ['L1'],
      })),
      focus: Array.from({ length: 6 }, () => ({
        title: 'a'.repeat(200),
        text: 'b'.repeat(600),
        sources: ['L1'],
      })),
    }))
    expect(parsed).not.toBeNull()
    expect(parsed!.headline).toHaveLength(240)
    expect(parsed!.mustKnow).toHaveLength(8)
    expect(parsed!.mustKnow[0].label).toHaveLength(40)
    expect(parsed!.mustKnow[0].text).toHaveLength(200)
    expect(parsed!.focus).toHaveLength(3)
    expect(parsed!.focus[0].title).toHaveLength(120)
    expect(parsed!.focus[0].text).toHaveLength(400)
  })

  describe('failure diagnostics', () => {
    const originalEnv = process.env.NODE_ENV
    let warn: jest.SpyInstance

    beforeEach(() => {
      warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    })
    afterEach(() => {
      warn.mockRestore()
      Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, configurable: true })
    })

    it('warns with the failure reason and the raw reply head', () => {
      Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', configurable: true })
      useCase.parseResult('total garbage')
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('no parseable JSON found'),
        expect.stringContaining('total garbage'),
      )
    })

    it('truncates the logged head to 300 chars', () => {
      Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', configurable: true })
      useCase.parseResult('x'.repeat(500))
      expect((warn.mock.calls[0][1] as string).length).toBe(300)
    })

    it('does not warn on a successful parse', () => {
      useCase.parseResult(JSON.stringify(VALID_AI_RESULT))
      expect(warn).not.toHaveBeenCalled()
    })
  })
})

describe('modular summary generation contract', () => {
  const promptInput = {
    clinicalContext: '[E1] 內分泌科門診',
    catalog: buildSourceCatalog(CATALOG_INPUT),
    locale: 'zh-TW' as const,
    audience: 'medical' as const,
  }

  it('builds a card-specific output contract instead of requiring the full summary object', () => {
    const messages = useCase.buildModuleMessages(promptInput, 'focus')
    const contract = messages[0].content.slice(
      messages[0].content.indexOf('MODULAR OUTPUT CONTRACT'),
    )
    expect(contract).toContain('Generate ONLY the "focus" module')
    expect(contract).toContain('"items"')
    expect(contract).not.toContain('"problems"')
    expect(contract).not.toContain('"recent"')
  })

  it('forces clinician overviews to an empty medicationEducation literal', () => {
    const messages = useCase.buildModuleMessages(promptInput, 'overview')
    expect(messages[0].content).toContain('"medicationEducation" MUST be the literal empty array []')
    expect(messages[0].content).toContain('"mustKnow"')
  })

  it('forces patient overviews to an empty mustKnow literal', () => {
    const messages = useCase.buildModuleMessages(
      { ...promptInput, audience: 'patient' },
      'overview',
    )
    expect(messages[0].content).toContain('"mustKnow" MUST be the literal empty array []')
    expect(messages[0].content).toContain('"medicationEducation"')
  })

  it('builds one batch prompt with four independently delimited JSON blocks', () => {
    const content = useCase.buildBatchModuleMessages(promptInput)[0].content
    for (const moduleId of ['overview', 'focus', 'problems', 'recent']) {
      expect(content).toContain(`<<<MEDIPRISMA_MODULE:${moduleId}>>>`)
      expect(content).toContain(`<<<END_MEDIPRISMA_MODULE:${moduleId}>>>`)
    }
  })

  it('builds one batch from the five registered cards with Safety last', () => {
    const cards = registeredMedicalSummaryCards(promptInput)
    expect(cards.map((card) => card.id)).toEqual([
      'overview', 'focus', 'problems', 'recent', 'safety',
    ])
    const content = useCase.buildRegisteredCardBatchMessages(
      promptInput,
      cards.map((card) => card.buildBatchInstruction(promptInput)),
    )[0].content
    expect(content).toContain('Generate all 5 registered cards')
    expect(content.indexOf('<<<MEDIPRISMA_MODULE:overview>>>'))
      .toBeLessThan(content.indexOf('<<<MEDIPRISMA_MODULE:safety>>>'))
  })

  it('puts the compact overview card first for a local endpoint', () => {
    const cards = registeredMedicalSummaryCards({
      ...promptInput,
      harnessProfile: 'local-small',
    })
    expect(cards.map((card) => card.id)).toEqual([
      'overview', 'problems', 'focus', 'recent', 'safety',
    ])
  })

  it('supports removing a card without adding an orchestration branch', () => {
    const cards = registeredMedicalSummaryCards(promptInput, ['overview', 'safety'])
    expect(cards.map((card) => card.id)).toEqual(['overview', 'safety'])
  })

  it('builds one retry batch containing only the failed registered cards', () => {
    const failed = [
      MEDICAL_SUMMARY_CARD_REGISTRY.problems,
      MEDICAL_SUMMARY_CARD_REGISTRY.recent,
    ]
    const content = useCase.buildRegisteredCardBatchMessages(
      promptInput,
      failed.map((card) => card.buildBatchInstruction(promptInput)),
    )[0].content
    expect(content).toContain('Generate all 2 registered cards')
    expect(content).toContain('<<<MEDIPRISMA_MODULE:problems>>>')
    expect(content).not.toContain('<<<MEDIPRISMA_MODULE:overview>>>')
  })

  it('can build a smaller requested-module batch for local-model A/B evaluation', () => {
    const content = useCase.buildBatchModuleMessages(promptInput, ['overview', 'recent'])[0].content
    expect(content).toContain('Generate only the 2 requested modules')
    expect(content).toContain('<<<MEDIPRISMA_MODULE:overview>>>')
    expect(content).not.toContain('<<<MEDIPRISMA_MODULE:problems>>>')
  })

  it('uses a shorter module-scoped contract for an instruction-sensitive local endpoint', () => {
    const local = useCase.buildModuleMessages(
      { ...promptInput, harnessProfile: 'local-small' },
      'recent',
    )[0].content
    expect(local).toContain('NON-NEGOTIABLE EVIDENCE CONTRACT')
    expect(local).toContain('RECENT:')
    expect(local).not.toContain('PROBLEMS:')
    // The long frontier prompt must not leak into the compact contract.
    expect(local).not.toContain('Completeness sweep')
  })

  it('sends only module-relevant keyed evidence on a local retry', () => {
    const catalog = buildSourceCatalog(CATALOG_INPUT)
    const messages = useCase.buildModuleMessages(
      {
        clinicalContext: '[E1] 內分泌科門診\n[M1] Metformin 500mg\n[C1] 第2型糖尿病',
        catalog,
        locale: 'zh-TW',
        audience: 'medical',
        harnessProfile: 'local-small',
      },
      'recent',
    )
    // Recent events are chosen from encounters/procedures/reports; the lab
    // Observation rows a value-oriented module needs are not sent again.
    expect(messages[1].content).toContain('[E1]')
    expect(messages[1].content).toContain('[M1]')
  })

  it('scrubs patient literals from appended context and source labels at the final boundary', () => {
    const messages = useCase.buildModuleMessages(
      {
        clinicalContext: '病人 A123456789 於門診追蹤',
        piiLiterals: ['王小明'],
        catalog: [{
          key: 'E1',
          resourceType: 'Encounter',
          resourceId: 'enc-1',
          display: '王小明 門診',
        }],
        locale: 'zh-TW',
        audience: 'medical',
      },
      'overview',
    )
    expect(messages[1].content).not.toContain('A123456789')
    expect(messages[1].content).not.toContain('王小明')
  })

  it('does not accept an unrelated/defaulted object as a successful module', () => {
    expect(useCase.parseModuleResult('problems', JSON.stringify({}))).toBeNull()
    expect(useCase.parseModuleResult('focus', JSON.stringify({ problems: [] }))).toBeNull()
    expect(useCase.parseModuleResult('recent', JSON.stringify({ recent: [] }))).toEqual({ recent: [] })
  })

  it('validates each module independently so one malformed card does not discard another', () => {
    const text = [
      '<<<MEDIPRISMA_MODULE:overview>>>',
      JSON.stringify({ headline: '摘要', mustKnow: [], medicationEducation: [] }),
      '<<<END_MEDIPRISMA_MODULE:overview>>>',
      '<<<MEDIPRISMA_MODULE:problems>>>',
      '{ this is not json',
      '<<<END_MEDIPRISMA_MODULE:problems>>>',
      '<<<MEDIPRISMA_MODULE:recent>>>',
      JSON.stringify({ recent: [{ ref: 'E1', label: '門診', category: 'encounter' }] }),
      '<<<END_MEDIPRISMA_MODULE:recent>>>',
    ].join('\n')
    expect(useCase.parseBatchModuleResult('overview', text)?.headline).toBe('摘要')
    expect(useCase.parseBatchModuleResult('problems', text)).toBeNull()
    expect(useCase.parseBatchModuleResult('recent', text)?.recent).toHaveLength(1)
  })

  it('salvages a complete final JSON block when only its closing marker is truncated', () => {
    const text = [
      '<<<MEDIPRISMA_MODULE:overview>>>',
      JSON.stringify({ headline: '摘要', mustKnow: [], medicationEducation: [] }),
      '<<<END_MEDIPRISMA_MODULE:overview>>>',
      '<<<MEDIPRISMA_MODULE:recent>>>',
      JSON.stringify({ recent: [{ ref: 'E1', label: '門診' }] }),
    ].join('\n')
    expect(useCase.parseBatchModuleResult('recent', text)?.recent).toHaveLength(1)
  })

  it('does not treat a parseable streaming block as complete before its closing marker', () => {
    const partial = [
      '<<<MEDIPRISMA_MODULE:overview>>>',
      JSON.stringify({ headline: '摘要', mustKnow: [], medicationEducation: [] }),
    ].join('\n')
    expect(useCase.hasCompleteBatchModuleBlock('overview', partial)).toBe(false)
    expect(useCase.hasCompleteBatchModuleBlock(
      'overview',
      `${partial}\n<<<END_MEDIPRISMA_MODULE:overview>>>`,
    )).toBe(true)
  })

  it('repairs harmless citation formatting and reports only truly unknown keys', () => {
    expect(normaliseSummarySourceKey('[l 1]')).toBe('L1')
    expect(normaliseSummarySourceKey('e2')).toBe('E2')
    const unknown = useCase.findUnknownSourceKeys(
      {
        problems: [{ label: 'x', sources: ['[e 1]', 'Z9'] }],
        recent: [{ ref: 'm1' }],
      },
      buildSourceCatalog(CATALOG_INPUT),
    )
    expect(unknown).toEqual(['Z9'])
  })

  it('merges a retried module into an existing draft without replacing successful cards', () => {
    const draft = useCase.createEmptyAiResult()
    const withOverview = useCase.mergeModuleResult(draft, 'overview', {
      headline: '摘要',
      mustKnow: [{ slot: 'renal', label: 'eGFR 32', text: '腎功能', sources: ['L1'] }],
      medicationEducation: [],
    })
    const withFocus = useCase.mergeModuleResult(withOverview, 'focus', {
      items: [{ title: '腎功能下降', text: 'eGFR 33 → 32', sources: ['L1'] }],
    })
    const withRecent = useCase.mergeModuleResult(withFocus, 'recent', {
      recent: [{ ref: 'E1', label: '門診' }],
    })
    expect(withRecent.headline).toBe('摘要')
    expect(withRecent.mustKnow).toHaveLength(1)
    expect(withRecent.focus[0].title).toBe('腎功能下降')
    expect(withRecent.recent).toHaveLength(1)
  })
})

describe('初診快覽 prompt contract', () => {
  const promptInput = {
    clinicalContext: '[E1] 內分泌科門診',
    catalog: buildSourceCatalog(CATALOG_INPUT),
    locale: 'zh-TW' as const,
    audience: 'medical' as const,
  }

  it('asks 開藥前必看 for one row per slot, values first, and never for allergy', () => {
    const content = useCase.buildBatchModuleMessages(promptInput)[0].content
    expect(content).toContain('Emit at most ONE item per "slot"')
    // Allergy is app-derived now: no slot, no prompt sentence, and no keyless
    // row exception — every mustKnow row must cite at least one source.
    expect(content).not.toContain('allergy')
    expect(content).not.toContain('雲端無過敏資料')
    expect(content).toContain('never emit an item with an empty sources array. ')
  })

  it('rejects a mustKnow row that cites nothing', () => {
    const withKeylessRow = {
      ...VALID_AI_RESULT,
      mustKnow: [
        ...VALID_AI_RESULT.mustKnow,
        { slot: 'other', label: '無過敏紀錄', text: '雲端無過敏資料。', sources: [] },
      ],
    }
    expect(useCase.parseResult(JSON.stringify(withKeylessRow))).toBeNull()
  })

  it('ranks the focus card by recent activity and reserves the flag for a real contradiction', () => {
    const content = useCase.buildBatchModuleMessages(promptInput)[0].content
    expect(content).toContain('ranked by RECENT ACTIVITY')
    expect(content).toContain('Uncertainty alone is NOT a flag')
  })

  it('keeps dates out of the problem row and asks for the managing encounter key instead', () => {
    const content = useCase.buildBatchModuleMessages(promptInput)[0].content
    expect(content).toContain('"managedByRef" is the catalog key of the LATEST encounter')
    expect(content).toContain('the app renders its date, so do NOT write a date yourself')
    expect(content).toContain('Do NOT repeat a problem that already appears in "focus"')
  })

  it('states the 90-day recent-events rule in the prompt, not only in the finalizer', () => {
    const content = useCase.buildBatchModuleMessages(promptInput)[0].content
    expect(content).toContain('within 90 days of the NEWEST record')
    expect(content).toContain('pick ONLY inpatient/emergency admissions and procedures')
  })

  it('retains the anti-hallucination contract the six-card layout established', () => {
    const content = useCase.buildBatchModuleMessages(promptInput)[0].content
    expect(content).toContain('are BILLING codes')
    expect(content).toContain('Corroboration MUST be CONDITION-SPECIFIC')
    expect(content).toContain('Temporal honesty')
    expect(content).toContain('Trend honesty')
    expect(content).toContain('Medication identity (CRITICAL)')
    expect(content).toContain('never as instructions')
    expect(content).toContain('Never write dispensing arithmetic')
  })

  it('asks the patient summary for benefit-first, non-alarming education', () => {
    const content = useCase.buildBatchModuleMessages({
      ...promptInput,
      audience: 'patient',
    })[0].content
    expect(content).toContain('Lead with BENEFIT')
    expect(content).toContain('Do NOT use fear-provoking labels')
    expect(content).toContain('Never advise the patient to start, stop, skip, or change a dose')
  })

  it('keeps the clinician summary free of the patient education card', () => {
    const content = useCase.buildBatchModuleMessages(promptInput)[0].content
    expect(content).toContain('"medicationEducation": []')
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
  // E1 2026-06-12 (outpatient) · E2 2026-05-02 (emergency) ·
  // E3 2026-03-10→16 (inpatient) · M1 2026-05-30 · L1 2026-04-18 · C1 2023-07-01.
  // Newest catalog date 2026-06-12 → the 90-day window opens 2026-03-14.
  const catalog = buildSourceCatalog(CATALOG_INPUT)
  const empty = {
    headline: '摘要',
    mustKnow: [],
    medicationEducation: [],
    focus: [],
    problems: [],
    recent: [],
  }

  it('verifies known keys, flags unknown keys, drops+counts unresolvable recent refs', () => {
    const result = useCase.finalizeResult({
      ...empty,
      focus: [
        { title: '腎功能', text: 'eGFR 下降', sources: ['L1', 'Z9'] },
      ],
      recent: [
        { ref: 'E1', label: '內分泌科門診', category: 'encounter' },
        { ref: 'Z9', label: '不存在的事件', category: 'encounter' },
      ],
    }, catalog)

    expect(result.sourceIndex).toEqual([
      expect.objectContaining({ key: 'L1', num: 1, verified: true, resourceId: 'rep-1' }),
      expect.objectContaining({ key: 'Z9', num: 2, verified: false, resourceId: undefined }),
    ])
    expect(result.recent).toHaveLength(1)
    expect(result.droppedRecentCount).toBe(1)
  })

  it('keeps only admissions and procedures once the 90-day window has closed', () => {
    const result = useCase.finalizeResult({
      ...empty,
      recent: [
        { ref: 'E1', label: '門診', category: 'encounter' },
        { ref: 'E2', label: '急診', category: 'encounter' },
        // Outside the window, but an inpatient stay — a milestone worth a row.
        { ref: 'E3', label: '肺炎住院', category: 'encounter' },
        // Outside the window and neither an admission nor a procedure.
        { ref: 'C1', label: '糖尿病診斷', category: 'diagnosis' },
      ],
    }, catalog)

    expect(result.recent.map((event) => event.key)).toEqual(['E1', 'E2', 'E3'])
    expect(result.recent.find((event) => event.key === 'E3')).toEqual(
      expect.objectContaining({ encounterClass: 'inpatient', endDate: '2026-03-16' }),
    )
    expect(result.droppedRecentCount).toBe(1)
  })

  it('drops exact duplicate recent events but keeps distinct events from one source', () => {
    const result = useCase.finalizeResult({
      ...empty,
      recent: [
        { ref: 'E1', label: '內分泌科門診', category: 'encounter' },
        { ref: 'E1', label: '內分泌科門診', category: 'encounter' },
        { ref: 'E1', label: '調整用藥', category: 'medication' },
      ],
    }, catalog)

    expect(result.recent).toHaveLength(2)
    expect(result.droppedRecentCount).toBe(0)
  })

  it('coerces an off-list recent category', () => {
    const result = useCase.finalizeResult({
      ...empty,
      recent: [{ ref: 'E1', label: '門診', category: 'surgery' }],
    }, catalog)
    expect(result.recent[0].category).toBe('encounter')
  })

  it('resolves harmlessly reformatted citations to the canonical source key', () => {
    const result = useCase.finalizeResult({
      ...empty,
      mustKnow: [{ slot: 'renal', label: 'eGFR 32', text: '腎功能', sources: ['[l 1]'] }],
      recent: [{ ref: 'e1', label: '門診', category: 'encounter' }],
    }, catalog)

    expect(result.sourceIndex[0]).toEqual(
      expect.objectContaining({ key: 'L1', verified: true }),
    )
    expect(result.recent).toHaveLength(1)
    expect(result.droppedRecentCount).toBe(0)
  })

  it('coerces an off-list mustKnow slot and keeps one row per slot', () => {
    const result = useCase.finalizeResult({
      ...empty,
      mustKnow: [
        { slot: 'renal', label: 'eGFR 32', text: '第一列', sources: ['L1'] },
        { slot: 'RENAL', label: 'Cr 1.93', text: '同一格，應被丟棄', sources: ['L1'] },
        { slot: 'qt-interval', label: 'QTc', text: '不在列舉內 → other', sources: ['L1'] },
        // A second catch-all row is a DIFFERENT fact, so 'other' dedupes by label.
        { slot: 'other', label: '跨院開藥', text: '兩家院所同時開藥', sources: ['E1'] },
        { slot: 'other', label: '跨 院 開藥', text: '同一件事，空白不算差異', sources: ['E1'] },
      ],
    }, catalog)

    expect(result.mustKnow.map((item) => [item.slot, item.label])).toEqual([
      ['renal', 'eGFR 32'],
      ['other', 'QTc'],
      ['other', '跨院開藥'],
    ])
    expect(result.mustKnow[0].critical).toBe(false)
  })

  it('keeps the allergy row that has no record to cite', () => {
    const result = useCase.finalizeResult({
      ...empty,
      mustKnow: [
        { slot: 'allergy', label: '無過敏紀錄', text: '雲端無過敏資料，非確認無過敏。', sources: [] },
      ],
    }, catalog)
    expect(result.mustKnow).toHaveLength(1)
    expect(result.mustKnow[0].sourceKeys).toEqual([])
  })

  it('drops a problem the focus card already carries and counts the drop', () => {
    const result = useCase.finalizeResult({
      ...empty,
      focus: [
        { title: '腎功能持續下降 · CKD 3b', text: 'eGFR 33 → 32', sources: ['L1'] },
      ],
      problems: [
        // Contained in the focus title (ignoring case and spacing) → dropped.
        { label: 'CKD 3b', kind: 'lab', sources: ['L1'] },
        { label: 'ckd  3B', kind: 'lab', sources: ['L1'] },
        { label: '第2型糖尿病', kind: 'careplan', sources: ['C1'] },
      ],
    }, catalog)

    expect(result.problems.map((problem) => problem.label)).toEqual(['第2型糖尿病'])
    expect(result.droppedProblemCount).toBe(2)
  })

  it('resolves the managing encounter date app-side and never from the model', () => {
    const result = useCase.finalizeResult({
      ...empty,
      problems: [{
        label: '第2型糖尿病',
        kind: 'careplan',
        metric: 'HbA1c 6.6%',
        metricMeta: '2026-04-18',
        managedBy: '甲醫學中心 內分泌科',
        managedByRef: 'E1',
        medications: 'Metformin 500mg',
        sources: ['C1', 'M1'],
      }],
    }, catalog)

    expect(result.problems[0]).toEqual(expect.objectContaining({
      managedBy: '甲醫學中心 內分泌科',
      managedByDate: '2026-06-12',
      metric: 'HbA1c 6.6%',
      medications: 'Metformin 500mg',
      kind: 'careplan',
    }))
    // A managedByRef that does not resolve yields no date at all — the app
    // never invents one, and never shows the model's.
    const unresolved = useCase.finalizeResult({
      ...empty,
      problems: [{ label: 'x', kind: 'other', managedByRef: 'Z9', sources: ['C1'] }],
    }, catalog)
    expect(unresolved.problems[0].managedByDate).toBeUndefined()
  })

  it('numbers sources in render order: mustKnow → education → focus → problems', () => {
    const result = useCase.finalizeResult({
      ...empty,
      mustKnow: [{ slot: 'renal', label: 'eGFR', text: '腎功能', sources: ['L1'] }],
      focus: [{ title: '就診主因', text: '說明', sources: ['E1'] }],
      problems: [{ label: '第2型糖尿病', kind: 'careplan', sources: ['C1'] }],
    }, catalog)

    expect(result.sourceIndex.map((source) => source.key)).toEqual(['L1', 'E1', 'C1'])
  })

  it('normalises an off-list problem kind', () => {
    const result = useCase.finalizeResult({
      ...empty,
      problems: [{ label: '第2型糖尿病', kind: 'claim', sources: ['C1'] }],
    }, catalog)
    expect(result.problems[0].kind).toBe('other')
  })

  it('flags problem citations whose report type contradicts the stated basis', () => {
    const ecgCatalog = buildSourceCatalog({
      ...CATALOG_INPUT,
      diagnosticReports: [
        { id: 'rep-1', code: { text: '胸部X光' }, effectiveDateTime: '2026-04-18' },
        { id: 'rep-2', code: { text: '心電圖' }, effectiveDateTime: '2026-04-17' },
      ],
    })
    const result = useCase.finalizeResult({
      ...empty,
      problems: [{
        label: '心律不整',
        basis: '依據:心電圖紀錄',
        kind: 'lab',
        sources: ['L1', 'L2'],
      }],
    }, ecgCatalog)

    // L1 is the chest film — shown, but marked suspect; L2 (the ECG) is clean.
    expect(result.problems[0].suspectSourceKeys).toEqual(['L1'])
  })

  it('finalizes patient medication education and requires a verified medication record', () => {
    const result = useCase.finalizeResult({
      ...empty,
      medicationEducation: [
        { name: 'Metformin', benefit: '協助控制血糖', attention: '隨餐服用', sources: ['M1', 'C1'] },
        { name: '沒有來源的藥', benefit: 'x', attention: 'y', sources: ['C1'] },
      ],
    }, catalog, { audience: 'patient' })

    expect(result.medicationEducation).toHaveLength(1)
    expect(result.medicationEducation[0].sourceKeys).toEqual(['M1', 'C1'])
  })

  it('strictly grounds patient medication education and uses a generic reminder', () => {
    const result = useCase.finalizeResult({
      ...empty,
      medicationEducation: [
        { name: 'Metformin', benefit: '血糖控制不佳時使用', attention: '自行加量', sources: ['M1'] },
      ],
    }, catalog, { audience: 'patient', locale: 'zh-TW', strictGrounding: true })

    expect(result.medicationEducation[0].benefit).toContain('請向醫師或藥師確認')
    expect(result.medicationEducation[0].attention).toContain('請依醫囑使用')
  })

  it('strictly blocks medication-only problems and unassessed single-lab problems', () => {
    const result = useCase.finalizeResult({
      ...empty,
      problems: [
        { label: '糖尿病', basis: '用藥推斷', kind: 'medication', sources: ['M1'] },
        { label: '第2型糖尿病', basis: '照護計畫', kind: 'careplan', sources: ['C1'] },
      ],
    }, catalog, { strictGrounding: true })

    expect(result.problems.map((problem) => problem.label)).toEqual(['第2型糖尿病'])
  })

  it('removes unsupported assessment language from a strictly-grounded headline', () => {
    const result = useCase.finalizeResult(
      { ...empty, headline: '病人狀況穩定，血糖控制不佳，建議調整用藥' },
      catalog,
      { strictGrounding: true, locale: 'zh-TW' },
    )
    expect(result.headline).not.toContain('控制不佳')
    expect(result.headline).not.toContain('調整用藥')
  })
})

describe('local zh-TW prose guards', () => {
  const catalog = buildSourceCatalog(CATALOG_INPUT)

  it('repairs Simplified prose but keeps medicine names verbatim', () => {
    const ai = {
      headline: '血糖控制记录',
      mustKnow: [{ slot: 'endocrine-pending', label: '血糖', text: '近期血糖偏高，建议复诊。', sources: ['E1'] }],
      focus: [{ title: '血压追踪', text: '多次检验后复诊。', sources: ['E1'] }],
      problems: [{ label: '糖尿病', basis: '多次检验', kind: 'diagnosis', sources: ['E1'] }],
      recent: [{ ref: 'E1', label: '门诊复查', category: 'encounter' }],
      medicationEducation: [{ name: '测试药名', benefit: '控制血糖', attention: '注意低血糖', sources: ['M1'] }],
    }
    const result = useCase.finalizeResult(ai as never, catalog, { locale: 'zh-TW' })
    expect(result.headline).toBe('血糖控制記錄')
    expect(result.mustKnow[0]?.text).toBe('近期血糖偏高，建議複診。')
    expect(result.focus[0]?.text).toBe('多次檢驗後複診。')
    expect(result.recent[0]?.label).toBe('門診複查')
    expect(result.problems[0]?.basis).toBe('多次檢驗')
    expect(result.medicationEducation[0]?.name).toBe('测试药名')
    const en = useCase.finalizeResult(ai as never, catalog, { locale: 'en' })
    expect(en.headline).toBe('血糖控制记录')
  })

  it('accepts short verbatim Chinese quotes but not short Latin fragments', () => {
    expect(verifyDocumentQuote('疑似肺炎', '入院診斷：疑似肺炎。').verification).toBe('exact')
    expect(verifyDocumentQuote('肺炎', '入院診斷：疑似肺炎。').verification).toBe('not-found')
    expect(verifyDocumentQuote('R/O PE', 'Impression: R/O PE').verification).toBe('not-found')
  })

  it('local prompt states record-date, certainty and Traditional-Chinese rules', () => {
    const input = { clinicalContext: 'ctx', catalog, locale: 'zh-TW', audience: 'medical', harnessProfile: 'local-small' } as never
    const messages = useCase.buildRegisteredCardBatchMessages(
      input,
      registeredMedicalSummaryCards(input).map((card) => card.buildBatchInstruction(input)),
    )
    expect(messages[0].content).toContain('document/admission date')
    expect(messages[0].content).toContain('Never upgrade a suspected')
    expect(messages[0].content).toContain('不得使用簡體字')
  })
})

