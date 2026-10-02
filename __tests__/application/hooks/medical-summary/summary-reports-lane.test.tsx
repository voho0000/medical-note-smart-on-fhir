/** @jest-environment jsdom */
// 影像與病理重點 runs as its own lane over the report digest: chunked requests
// (two in flight), hidden reasoning off on the compact harness, a failed chunk
// costing only its own reports, and module retries that keep or replace the
// verified quotes. Synthetic fixtures only.
import { act, renderHook } from '@testing-library/react'
import { useMedicalSummary } from '@/src/application/hooks/medical-summary/use-medical-summary.hook'
import { medicalSummaryStore } from '@/src/application/hooks/medical-summary/medical-summary-store'
import { buildSourceCatalog } from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'

const SLOT = 'reports-lane-slot'
const RAD = [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'RAD' }] }]

// Ten chest films → two chunks at the default eight reports per request.
const REPORTS = Array.from({ length: 10 }, (_, index) => ({
  id: `xr-${index}`,
  status: 'final',
  category: RAD,
  code: { text: 'Chest X-ray' },
  effectiveDateTime: `2026-03-${String(index + 10)}T09:00:00+08:00`,
  conclusion: `Findings: Lines and tubes in place.\nImpression: Finding ${index} is stable.`,
  performer: [{ display: '示範測試醫院' }],
}))

const CLINICAL_DATA = {
  encounters: [
    { id: 'enc-1', class: { code: 'IMP' }, period: { start: '2026-04-01', end: '2026-04-05' }, serviceProvider: { display: '示範測試醫院' } },
  ],
  medications: [
    { id: 'med-1', status: 'active', authoredOn: '2026-04-20', medicationCodeableConcept: { text: 'Metformin 500mg' } },
  ],
  diagnosticReports: REPORTS,
} as any
const CATALOG = buildSourceCatalog(CLINICAL_DATA)
const quoteFor = (key: string) => {
  const resourceId = CATALOG.find((entry) => entry.key === key)!.resourceId
  return `Finding ${resourceId.replace('xr-', '')} is stable.`
}

const block = (id: string, body: unknown) =>
  `<<<MEDIPRISMA_MODULE:${id}>>>${JSON.stringify(body)}<<<END_MEDIPRISMA_MODULE:${id}>>>`
const OVERVIEW_BLOCK = block('overview', {
  headline: '測試病人，跨院照護',
  mustKnow: [{ slot: 'other', label: 'Metformin', text: '跨院持續調劑中', sources: ['M1'] }],
  medicationEducation: [],
})
const NARRATIVE_BLOCKS = [
  block('problems', { problems: [{ label: '第二型糖尿病', basis: '藥局調劑', kind: 'medication', sources: ['M1'] }] }),
  block('focus', { items: [] }),
  block('recent', { recent: [] }),
  block('safety', { scannedCount: 0, alerts: [] }),
].join('\n')

const contentOf = (messages: Array<{ content: string }>) => messages.map((message) => message.content).join('\n')
const isReportsRequest = (messages: Array<{ content: string }>) => contentOf(messages).includes('<<<MEDIPRISMA_MODULE:reports>>>')
const isFastLaneRequest = (messages: Array<{ content: string }>) => {
  const content = contentOf(messages)
  return content.includes('<<<MEDIPRISMA_MODULE:overview>>>') && !content.includes('<<<MEDIPRISMA_MODULE:problems>>>')
}
/** Keys a reports request lists, in prompt order. */
const listedKeys = (messages: Array<{ content: string }>) =>
  [...messages[1].content.matchAll(/^\[(L\d+)\] /gm)].map((match) => match[1])
const reportsReply = (keys: string[]) =>
  block('reports', { reports: keys.map((key) => ({ ref: key, quotes: [quoteFor(key)] })) })

let mockSlotOptions: any
let mockResult: any
let mockAudience: 'medical' | 'patient' = 'medical'
let contextLimit = 120_000
const mockStream = jest.fn()

const runGeneration = async (overrides: Record<string, unknown> = {}) => {
  mockResult = await mockSlotOptions.run({
    operationKey: SLOT,
    modelId: 'gpt-nano-2',
    requestedModelId: 'gpt-nano-2',
    modelName: 'GPT Nano',
    locale: 'zh-TW',
    audience: mockAudience,
    clinicalContext: 'Patient Information:\n- Gender: Male',
    clinicalData: CLINICAL_DATA,
    patient: { id: 'p1', resourceType: 'Patient', gender: 'male', birthDate: '1948-01-01' },
    clinicalNowMs: Date.parse('2026-04-21T00:00:00Z'),
    catalog: CATALOG,
    piiLiterals: [],
    contextLimit,
    ai: { stream: mockStream },
    ...overrides,
  })
}

jest.mock('@/src/application/hooks/ai-generation/use-ai-slot-generation.hook', () => ({
  useAiSlotGeneration: (options: any) => {
    mockSlotOptions = options
    return {
      slotKey: SLOT,
      catalog: CATALOG,
      clinicalData: CLINICAL_DATA,
      dataReady: true,
      generate: () => runGeneration(),
    }
  },
}))
jest.mock('@/src/application/providers/audience.provider', () => ({ useAudience: () => ({ audience: mockAudience }) }))
jest.mock('@/src/application/providers/ai-demographics-gate.provider', () => ({ useAiDemographicsGate: () => ({ demographicsReadyForAi: true }) }))

beforeEach(() => {
  mockResult = undefined
  mockAudience = 'medical'
  contextLimit = 120_000
  mockStream.mockReset()
  medicalSummaryStore.setState({ byKey: {}, running: { [SLOT]: true } } as any)
  jest.spyOn(console, 'info').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

/** Default model: every lane answers correctly; reports requests take a tick. */
function answerEverything(
  reportsBehaviour: (keys: string[], callIndex: number) => string = (keys) => reportsReply(keys),
) {
  let inFlight = 0
  let maxInFlight = 0
  let reportsCalls = 0
  mockStream.mockImplementation(async (messages: any[], options: any) => {
    if (isReportsRequest(messages)) {
      const callIndex = reportsCalls++
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      const reply = reportsBehaviour(listedKeys(messages), callIndex)
      options.onChunk(reply)
      return reply
    }
    const reply = isFastLaneRequest(messages) ? OVERVIEW_BLOCK : NARRATIVE_BLOCKS
    options.onChunk(reply)
    return reply
  })
  return { maxInFlight: () => maxInFlight }
}

const reportsCalls = () => mockStream.mock.calls.filter(([messages]: any[]) => isReportsRequest(messages))

test('a fresh compact-harness run adds a chunked reports lane with hidden reasoning off', async () => {
  const probe = answerEverything()
  const { result } = renderHook(() => useMedicalSummary())
  await act(async () => { await result.current.generate() })

  // Fast + full narrative lanes, plus two digest chunks.
  expect(mockStream).toHaveBeenCalledTimes(4)
  const calls = reportsCalls()
  expect(calls).toHaveLength(2)
  expect(calls.map(([messages]: any[]) => listedKeys(messages).length)).toEqual([8, 2])
  expect(probe.maxInFlight()).toBe(2)
  for (const [messages, options] of calls) {
    expect(options.hiddenReasoning).toBe('off')
    expect(options.operationKey).toBe(SLOT)
    // The lane input is the digest, not the clinical context.
    expect(contentOf(messages)).not.toContain('Patient clinical data')
    expect(contentOf(messages)).not.toContain('Metformin')
    expect(contentOf(messages)).not.toContain('<<<MEDIPRISMA_MODULE:overview>>>')
  }
  // The narrative lanes never carry the reports contract.
  for (const [messages] of mockStream.mock.calls.filter(([messages]: any[]) => !isReportsRequest(messages))) {
    expect(contentOf(messages)).not.toContain('<<<MEDIPRISMA_MODULE:reports>>>')
  }

  const highlights = mockResult.reportHighlights
  expect(highlights.totalReports).toBe(10)
  expect(highlights.aiSummarized).toBe(10)
  expect(highlights.items.every((item: any) => item.excerptSource === 'ai')).toBe(true)
  expect(mockResult.completedCardIds).toEqual(expect.arrayContaining(['overview', 'problems', 'reports', 'safety']))
  expect(mockResult.cardErrors).toBeUndefined()
  expect(mockResult.generation.cardModelExecutions.reports).toBeDefined()
})

test('a failed chunk falls back only its own reports', async () => {
  answerEverything((keys, callIndex) => (callIndex === 0 ? 'not json at all' : reportsReply(keys)))
  const { result } = renderHook(() => useMedicalSummary())
  await act(async () => { await result.current.generate() })

  const [firstChunk, secondChunk] = reportsCalls().map(([messages]: any[]) => listedKeys(messages))
  const items = mockResult.reportHighlights.items as any[]
  const sourceOf = (key: string) => items.find((item) => item.key === key).excerptSource
  expect(firstChunk.map(sourceOf)).toEqual(Array(8).fill('conclusion'))
  expect(secondChunk.map(sourceOf)).toEqual(['ai', 'ai'])
  expect(mockResult.reportHighlights.aiSummarized).toBe(2)
  // The card itself succeeded: one chunk is enough.
  expect(mockResult.cardErrors).toBeUndefined()
})

test('the card fails only when every chunk fails, and the section still renders from the digest', async () => {
  answerEverything(() => 'still not json')
  const { result } = renderHook(() => useMedicalSummary())
  await act(async () => { await result.current.generate() })

  expect(mockResult.cardErrors).toEqual({ reports: 'PARSE_FAILED' })
  expect(mockResult.reportHighlights.totalReports).toBe(10)
  expect(mockResult.reportHighlights.items.every((item: any) => item.excerptSource === 'conclusion')).toBe(true)
  expect(mockResult.problems).toHaveLength(1)
})

test('retrying the reports card runs that lane alone and replaces its rows', async () => {
  answerEverything(() => 'still not json')
  const { result } = renderHook(() => useMedicalSummary())
  await act(async () => { await result.current.generate() })
  expect(mockResult.cardErrors).toEqual({ reports: 'PARSE_FAILED' })
  medicalSummaryStore.setState({ byKey: { [SLOT]: mockResult }, running: { [SLOT]: true } } as any)

  mockStream.mockReset()
  answerEverything()
  await act(async () => { await result.current.retryFailedModules() })

  expect(mockStream).toHaveBeenCalledTimes(2)
  expect(reportsCalls()).toHaveLength(2)
  expect(mockResult.cardErrors).toBeUndefined()
  expect(mockResult.reportHighlights.aiSummarized).toBe(10)
  expect(mockResult.headline).toContain('測試病人')
  expect(mockResult.problems).toHaveLength(1)
})

test('verified quotes survive a retry of another card', async () => {
  let failOverview = true
  answerEverything()
  const base = mockStream.getMockImplementation()!
  mockStream.mockImplementation(async (messages: any[], options: any) => {
    if (failOverview && isFastLaneRequest(messages)) {
      options.onChunk('garbage')
      return 'garbage'
    }
    return base(messages, options)
  })
  const { result } = renderHook(() => useMedicalSummary())
  await act(async () => { await result.current.generate() })
  expect(mockResult.cardErrors).toEqual({ overview: 'PARSE_FAILED' })
  const before = mockResult.reportHighlights
  expect(before.aiSummarized).toBe(10)
  medicalSummaryStore.setState({ byKey: { [SLOT]: mockResult }, running: { [SLOT]: true } } as any)

  failOverview = false
  mockStream.mockClear()
  await act(async () => { await result.current.retryFailedModules() })

  expect(reportsCalls()).toHaveLength(0)
  expect(mockResult.cardErrors).toBeUndefined()
  expect(mockResult.reportHighlights).toEqual(before)
})

test('a frontier-window model also runs the reports lane, with its default reasoning', async () => {
  contextLimit = 900_000
  answerEverything()
  mockStream.mockImplementation(async (messages: any[], options: any) => {
    const reply = isReportsRequest(messages)
      ? reportsReply(listedKeys(messages))
      : `${OVERVIEW_BLOCK}\n${NARRATIVE_BLOCKS}`
    options.onChunk(reply)
    return reply
  })
  const { result } = renderHook(() => useMedicalSummary())
  await act(async () => { await result.current.generate() })

  expect(mockStream).toHaveBeenCalledTimes(3)
  for (const [, options] of reportsCalls()) expect(options.hiddenReasoning).toBeUndefined()
  expect(mockResult.reportHighlights.aiSummarized).toBe(10)
})

test('the patient audience never requests the reports lane', async () => {
  mockAudience = 'patient'
  answerEverything()
  const { result } = renderHook(() => useMedicalSummary())
  await act(async () => { await result.current.generate() })

  expect(reportsCalls()).toHaveLength(0)
  expect(mockResult.reportHighlights).toBeUndefined()
})

describe('a reports chunk whose request fails', () => {
  const transportError = () => Object.assign(new Error('Provider returned 429 Too Many Requests'), { status: 429 })
  /** Fails the first (eight-report) chunk's request `times` times. */
  const failFirstChunk = (times: number) => {
    let failuresLeft = times
    return (keys: string[]) => {
      if (keys.length === 8 && failuresLeft > 0) {
        failuresLeft -= 1
        throw transportError()
      }
      return reportsReply(keys)
    }
  }
  const generateWithTimers = async (run: () => Promise<unknown>) => {
    await act(async () => {
      const pending = run()
      await jest.advanceTimersByTimeAsync(10_000)
      await pending
    })
  }

  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  test('is re-sent once after 2 s and keeps its AI quotes', async () => {
    answerEverything(failFirstChunk(1))
    const { result } = renderHook(() => useMedicalSummary())
    let pending!: Promise<void>
    await act(async () => {
      pending = result.current.generate()
      await jest.advanceTimersByTimeAsync(100)
    })
    // Both chunks went out; the first failed and is waiting, not re-sent yet.
    expect(reportsCalls()).toHaveLength(2)
    await act(async () => { await jest.advanceTimersByTimeAsync(1_800) })
    expect(reportsCalls()).toHaveLength(2)
    await act(async () => {
      await jest.advanceTimersByTimeAsync(500)
      await pending
    })

    const calls = reportsCalls().map(([messages]: any[]) => listedKeys(messages))
    expect(calls).toHaveLength(3)
    expect(calls[2]).toEqual(calls[0])
    expect(mockResult.reportHighlights.aiSummarized).toBe(10)
    expect(mockResult.reportHighlights.items.every((item: any) => item.excerptSource === 'ai')).toBe(true)
    expect(mockResult.cardErrors).toBeUndefined()
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('[medical-summary:reports] chunk 1/2 request failed; retrying once'))
  })

  test('falls back to its excerpts when the retry fails too', async () => {
    answerEverything(failFirstChunk(2))
    const { result } = renderHook(() => useMedicalSummary())
    await generateWithTimers(() => result.current.generate())

    const calls = reportsCalls().map(([messages]: any[]) => listedKeys(messages))
    // Initial pair plus exactly ONE re-send.
    expect(calls).toHaveLength(3)
    const items = mockResult.reportHighlights.items as any[]
    const sourceOf = (key: string) => items.find((item) => item.key === key).excerptSource
    expect(calls[0].map(sourceOf)).toEqual(Array(8).fill('conclusion'))
    expect(calls[1].map(sourceOf)).toEqual(['ai', 'ai'])
    expect(mockResult.cardErrors).toBeUndefined()
    expect(console.info).toHaveBeenCalledWith('[medical-summary:reports] chunk 1/2 failed; its reports fall back')
  })

  test('an unparseable reply is not re-sent', async () => {
    answerEverything((keys) => (keys.length === 8 ? 'not json at all' : reportsReply(keys)))
    const { result } = renderHook(() => useMedicalSummary())
    await generateWithTimers(() => result.current.generate())

    expect(reportsCalls()).toHaveLength(2)
    expect(mockResult.reportHighlights.aiSummarized).toBe(2)
  })

  test('a user stop is not retried', async () => {
    answerEverything((keys) => {
      if (keys.length === 8) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
      return reportsReply(keys)
    })
    renderHook(() => useMedicalSummary())
    let outcome: unknown
    await generateWithTimers(() => runGeneration().catch((error) => { outcome = error }))

    expect(outcome).toMatchObject({ name: 'AbortError' })
    expect(reportsCalls()).toHaveLength(2)
  })

  test('a stop during the retry wait sends nothing more', async () => {
    answerEverything(failFirstChunk(1))
    renderHook(() => useMedicalSummary())
    const runAbort = new AbortController()
    let outcome: unknown
    await act(async () => {
      const pending = runGeneration({ signal: runAbort.signal }).catch((error) => { outcome = error })
      await jest.advanceTimersByTimeAsync(500)
      expect(reportsCalls()).toHaveLength(2)
      runAbort.abort()
      await jest.advanceTimersByTimeAsync(10_000)
      await pending
    })

    expect(outcome).toMatchObject({ name: 'AbortError' })
    expect(reportsCalls()).toHaveLength(2)
  })
})

describe('on-prem latency budget', () => {
  test('the summary passes a 24K budget for self-hosted compact-harness windows only', () => {
    renderHook(() => useMedicalSummary())
    expect(mockSlotOptions.contextTokenBudget(262_144, { selfHosted: true })).toBe(24_000)
    expect(mockSlotOptions.contextTokenBudget(1_048_576, { selfHosted: true })).toBeUndefined()
    expect(mockSlotOptions.contextTokenBudget(120_000, { selfHosted: false })).toBeUndefined()
  })

  test('only the full-context request uses the narrowed records; the digest keeps the saved scope', async () => {
    answerEverything()
    // The budget kept two of the ten reports; their keys are the saved
    // catalog's (L-keys are newest-first, so these are not L1/L2 by accident).
    const keptReportIds = new Set(['xr-0', 'xr-1'])
    const narrowedCatalog = CATALOG.filter((entry) => (
      entry.resourceType !== 'DiagnosticReport' || keptReportIds.has(entry.resourceId)
    ))
    const keptKeys = narrowedCatalog
      .filter((entry) => entry.resourceType === 'DiagnosticReport')
      .map((entry) => entry.key)
    expect(keptKeys).toHaveLength(2)
    renderHook(() => useMedicalSummary())
    await act(async () => {
      await runGeneration({
        clinicalContextScope: {
          clinicalData: { ...CLINICAL_DATA, diagnosticReports: REPORTS.filter((report) => keptReportIds.has(report.id)) },
          catalog: narrowedCatalog,
        },
      })
    })

    const fullLane = mockStream.mock.calls.find(([messages]: any[]) => (
      !isReportsRequest(messages) && !isFastLaneRequest(messages)
    ))!
    const sourceList = fullLane[0][1].content.split('SOURCE LIST')[1]
    const listedReportKeys = [...sourceList.matchAll(/^\[(L\d+)\] /gm)].map((match: RegExpMatchArray) => match[1])
    expect(listedReportKeys.sort()).toEqual([...keptKeys].sort())
    // The report digest still covers every report in the saved scope.
    expect(reportsCalls().flatMap(([messages]: any[]) => listedKeys(messages))).toHaveLength(10)
    expect(mockResult.reportHighlights.totalReports).toBe(10)
    expect(mockResult.reportHighlights.aiSummarized).toBe(10)
  })
})
