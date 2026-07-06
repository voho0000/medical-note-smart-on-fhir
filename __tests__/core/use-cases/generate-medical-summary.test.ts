// Medical Summary use-case tests — the anti-hallucination contract:
// citations resolve against the app-built catalog; unknown keys stay visible
// as unverified; timeline picks with unknown refs are dropped AND counted.
import {
  GenerateMedicalSummaryUseCase,
  buildSourceCatalog,
  buildCoverageStats,
  classifyEncounterClass,
} from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'

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
        expect.stringContaining('no JSON object found'),
        'not json at all',
      )

      expect(useCase.parseResult('{"headline": "x", broken}')).toBeNull()
      expect(warnSpy).toHaveBeenLastCalledWith(
        expect.stringContaining('invalid JSON'),
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
