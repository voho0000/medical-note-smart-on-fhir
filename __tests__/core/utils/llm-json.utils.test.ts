import { tryExtractJsonValue } from '@/src/core/utils/llm-json.utils'
import { GenerateMedicalSummaryUseCase } from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'

describe('tryExtractJsonValue', () => {
  it('closes one or two omitted trailing brackets after a complete value', () => {
    const missingOuter = '{"medicationEducation": [], "medicationReview": {"regimen": [{"name": "A", "sources": ["M1"]}]}'
    expect(tryExtractJsonValue(missingOuter)).toEqual({
      medicationEducation: [], medicationReview: { regimen: [{ name: 'A', sources: ['M1'] }] },
    })
    expect(tryExtractJsonValue('{"a": {"b": [1, 2')).toBeNull() // cut mid-array, not on a closer
    expect(tryExtractJsonValue('{"a": {"b": {"c": [1]}')).toEqual({ a: { b: { c: [1] } } })
  })

  it('still rejects truncated strings, deep truncation and mismatched closers', () => {
    expect(tryExtractJsonValue('{"a": "unterminated }')).toBeNull()
    expect(tryExtractJsonValue('{"a": {"b": {"c": {"d": []}')).toBeNull()
    expect(tryExtractJsonValue('{"a": [1}')).toBeNull()
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
    expect(tryExtractJsonValue('{"a": {"t": "x}]"}')).toEqual({ a: { t: 'x}]' } })
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
