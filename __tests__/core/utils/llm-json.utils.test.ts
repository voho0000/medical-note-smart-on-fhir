import { tryExtractJsonValue } from '@/src/core/utils/llm-json.utils'
import { GenerateMedicalSummaryUseCase } from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'

const complete = { closeMissingBrackets: true }

describe('tryExtractJsonValue', () => {
  it('closes one omitted final } only when the caller knows the reply was complete', () => {
    const missingOuter = '{"medicationEducation": [], "medicationReview": {"regimen": [{"name": "A", "sources": ["M1"]}]}'
    expect(tryExtractJsonValue(missingOuter, complete)).toEqual({
      medicationEducation: [], medicationReview: { regimen: [{ name: 'A', sources: ['M1'] }] },
    })
    expect(tryExtractJsonValue(missingOuter)).toBeNull()
  })

  it('never turns a truncated reply into a shortened success', () => {
    // Cut mid second event: the tail after the last closer is not empty.
    const midItem = '{"timeline": [{"ref": "E1", "label": "a"}, {"ref": "E2", "lab'
    expect(tryExtractJsonValue(midItem, complete)).toBeNull()
    expect(tryExtractJsonValue(midItem)).toBeNull()
    // Cut exactly at an item boundary: an open list is never closed.
    expect(tryExtractJsonValue('{"timeline": [{"ref": "E1", "label": "a"}', complete)).toBeNull()
    expect(tryExtractJsonValue('{"a": {"b": {"c": [1]}', complete)).toBeNull() // two missing
    expect(tryExtractJsonValue('{"a": "unterminated }', complete)).toBeNull()
    expect(tryExtractJsonValue('{"a": [1}', complete)).toBeNull()
  })

  it('drops one or two surplus closing brackets at the very end only', () => {
    expect(tryExtractJsonValue('{"a": {"b": []}}\n}')).toEqual({ a: { b: [] } })
    expect(tryExtractJsonValue('{"a": 1}}, {"b": 2}')).toBeNull()
  })

  it('inserts a colon missing after an identifier key', () => {
    expect(tryExtractJsonValue('{"trend": "8.2%", "interpretation "需追蹤", "sources": ["O1"]}'))
      .toEqual({ trend: '8.2%', interpretation: '需追蹤', sources: ['O1'] })
  })

  it('escapes a record quote copied inside a string value', () => {
    expect(tryExtractJsonValue('{"regimen": [{"name": "Nifedipine "X.R." 30mg", "sources": ["M1"]}]}'))
      .toEqual({ regimen: [{ name: 'Nifedipine "X.R." 30mg', sources: ['M1'] }] })
  })

  it('does not alter already-valid JSON', () => {
    const valid = '{"a": "He said \\"hi\\"", "b": ["x", "y"], "c": {"d": "{not a brace}"}}'
    expect(tryExtractJsonValue(valid)).toEqual(JSON.parse(valid))
  })

  it('keeps braces inside strings out of the bracket balance', () => {
    expect(tryExtractJsonValue('{"a": {"t": "x}]"}', complete)).toEqual({ a: { t: 'x}]' } })
  })
})

describe('medical summary batch blocks', () => {
  const useCase = new GenerateMedicalSummaryUseCase()
  const block = (id: string, body: string, closed = true) =>
    `<<<MEDIPRISMA_MODULE:${id}>>>\n${body}\n${closed ? `<<<END_MEDIPRISMA_MODULE:${id}>>>` : ''}`

  it('repairs an omitted final } in a block whose end marker arrived', () => {
    const body = '{"timeline": [{"ref": "E1", "label": "住院", "category": "encounter"}]'
    expect(useCase.parseBatchModuleResult('timeline', block('timeline', body))?.timeline).toHaveLength(1)
  })

  it('rejects a truncated final block instead of keeping only its first items', () => {
    const truncated = '{"timeline": [{"ref": "E1", "label": "住院", "category": "encounter"}, {"ref": "E2", "lab'
    expect(useCase.parseBatchModuleResult('timeline', block('timeline', truncated, false))).toBeNull()
    const atBoundary = '{"timeline": [{"ref": "E1", "label": "住院", "category": "encounter"}]'
    expect(useCase.parseBatchModuleResult('timeline', block('timeline', atBoundary, false))).toBeNull()
  })
})

describe('investigations card with a null interpretation', () => {
  it('keeps the card and fills a neutral interpretation', () => {
    const useCase = new GenerateMedicalSummaryUseCase()
    const parsed = useCase.parseModuleResult('investigations',
      '{"investigations": [{"label": "HbA1c", "kind": "lab", "direction": "single", "trend": "8.2%", "interpretation": null, "sources": ["O1"]}]}')
    expect(parsed).not.toBeNull()
    expect(parsed?.investigations[0].interpretation).toBe('')
    const catalog = [{ key: 'O1', resourceType: 'Observation', resourceId: 'o1', display: 'HbA1c', date: '2026-08-01' }]
    const result = useCase.finalizeResult(
      { headline: 'h', summary: [{ text: 't', emphasis: false, sources: [] }], problems: [], decisions: [], timeline: [], investigations: parsed!.investigations } as never,
      catalog,
      { locale: 'zh-TW', strictGrounding: true },
    )
    expect(result.investigations[0].interpretation.length).toBeGreaterThan(0)
  })
})
