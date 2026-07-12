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
} from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'
import type { MedicationEntity } from '@/src/core/entities/clinical-data.entity'

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
      period: { start: '2026-03-10T00:00:00+08:00' },
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

  it('retains one citable chronic record per drug beyond the recent medication cap', () => {
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

    expect(medicationSources).toHaveLength(41)
    expect(medicationSources.some((source) => source.resourceId === 'old-chronic-forxiga')).toBe(true)
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
})

describe('buildLongitudinalInvestigationContext', () => {
  it('surfaces serial labs and imaging from all available reports so they are not labeled single', () => {
    const input = {
      diagnosticReports: [
        {
          id: 'a1c-new',
          category: [{ text: 'Laboratory' }],
          code: { text: 'HbA1c' },
          effectiveDateTime: '2026-06-02',
          result: [{ reference: 'Observation/obs-a1c-new' }],
        },
        {
          id: 'a1c-old',
          category: [{ text: 'Laboratory' }],
          code: { text: 'HbA1c' },
          effectiveDateTime: '2025-12-09',
          result: [{ reference: 'Observation/obs-a1c-old' }],
        },
        {
          id: 'psa-new',
          category: [{ text: 'Laboratory' }],
          code: { text: 'PSA' },
          effectiveDateTime: '2026-06-02',
          result: [{ reference: 'Observation/obs-psa-new' }],
        },
        {
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
    expect(context).toContain('HbA1c: 6.7 % (2025-12-09;')
    expect(context).toContain('6.6 % (2026-06-02;')
    expect(context).toContain('PSA: 1.32 ng/mL (2025-02-10;')
    expect(context).toContain('0.64 ng/mL (2026-06-02;')
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
      problems: [{ label: '慢性腎臟病', basis: 'b'.repeat(100), kind: 'careplan', sources: [] }],
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
    expect(result.timeline[2]).toMatchObject({ key: 'E3', encounterClass: 'inpatient' })
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
    const ai = {
      headline: 'h',
      summary: [{ text: 't', emphasis: false, sources: [] }],
      investigations: [
        {
          label: 'HbA1c',
          kind: 'lab',
          direction: 'worsening',
          trend: '7.2% → 8.4%',
          interpretation: '血糖控制變差',
          sources: ['L1', 'L99'],
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
    const result = useCase.finalizeResult(ai, catalog)
    expect(result.investigations[0]).toMatchObject({
      kind: 'lab',
      direction: 'worsening',
      sourceKeys: ['L1', 'L99'],
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

  it('keeps demo Forxiga while excluding completed-only Uretropic history', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bundle = require('../../../public/demo/demo-bundle.json') as {
      entry: Array<{ resource: Record<string, unknown> & { resourceType?: string } }>
    }
    const medications = bundle.entry
      .map((entry) => entry.resource)
      .filter((resource) => resource.resourceType === 'MedicationRequest') as unknown as MedicationEntity[]
    const demoCatalog = buildSourceCatalog({ medications })
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { demoMedicalSummarySnapshots } = require('../../../src/infrastructure/demo/demo-ai-snapshots')
    const parsed = useCase.parseResult(JSON.stringify(demoMedicalSummarySnapshots.medical))
    expect(parsed).not.toBeNull()

    const result = useCase.finalizeResult(parsed!, demoCatalog, {
      clinicalData: { medications },
      audience: 'medical',
      locale: 'zh-TW',
    })
    expect(result.medicationReview.regimen).toHaveLength(8)
    expect(result.medicationReview.overview).toContain('進階治療型態')
    expect(result.medicationReview.regimen[0]).toMatchObject({
      group: '血糖／腎臟',
      name: 'Forxiga Film-coated Tablets 10mg',
    })
    const forxiga = result.medicationReview.regimen.find(
      (item) => item.name.includes('Forxiga'),
    )

    expect(forxiga).toMatchObject({ group: '血糖／腎臟', sig: undefined })
    expect(result.medicationReview.regimen.some((item) => item.group === '同次慢箋')).toBe(false)
    expect(result.medicationReview.regimen.find((item) => item.name.includes('PATEAR')))
      .toMatchObject({ group: '眼表潤滑' })
    expect(result.medicationReview.regimen.some((item) => item.name.includes('URETROPIC'))).toBe(false)
    expect(result.medicationReview.changes).toEqual([])
    expect(result.medicationReview.regimen.find((item) => item.group === '青光眼')?.name)
      .toContain('三種降眼壓藥併用')
    // Exactly ONE reconciliation item survives the quality bar. Deliberately
    // absent: the Alphagan P → Brimonin same-institution brand switch (a clean
    // sequential switch answers itself from the record) and an Imimine
    // no-documented-indication item (it was co-prescribed with tamsulosin at a
    // BPH visit — the prescribing-visit context IS its plausible indication).
    expect(result.medicationReview.reconciliation).toEqual([
      expect.objectContaining({
        reason: 'multi-facility',
        text: expect.stringContaining('Sennosides'),
      }),
    ])
    const citedResourceIds = forxiga?.sourceKeys.map(
      (key) => demoCatalog.find((source) => source.key === key)?.resourceId,
    )
    expect(citedResourceIds).toEqual(expect.arrayContaining([
      'demo-medicationrequest-29', // continuous / 慢箋 evidence
      'demo-medicationrequest-99', // latest pharmacy record
    ]))
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
