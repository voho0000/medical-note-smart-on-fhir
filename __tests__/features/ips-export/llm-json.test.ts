import {
  extractJsonObject,
  parseInferenceResponse,
  LlmJsonError,
} from '@/features/ips-export/utils/llm-json'

describe('extractJsonObject', () => {
  it('parses a clean JSON object', () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 })
  })

  it('parses a clean JSON array', () => {
    expect(extractJsonObject('[1,2,3]')).toEqual([1, 2, 3])
  })

  it('strips a ```json fenced block', () => {
    const raw = 'Here you go:\n```json\n{"problems":[]}\n```\nthanks'
    expect(extractJsonObject(raw)).toEqual({ problems: [] })
  })

  it('strips a plain ``` fenced block', () => {
    expect(extractJsonObject('```\n{"x":true}\n```')).toEqual({ x: true })
  })

  it('slices JSON out of surrounding prose', () => {
    const raw = 'Sure! The JSON is { "n": 42 } — let me know if you need more.'
    expect(extractJsonObject(raw)).toEqual({ n: 42 })
  })

  it('repairs a single trailing comma before }', () => {
    expect(extractJsonObject('{"a":1,}')).toEqual({ a: 1 })
  })

  it('repairs trailing commas inside arrays', () => {
    expect(extractJsonObject('{"xs":[1,2,3,],}')).toEqual({ xs: [1, 2, 3] })
  })

  it('throws LlmJsonError on empty input', () => {
    expect(() => extractJsonObject('')).toThrow(LlmJsonError)
  })

  it('throws LlmJsonError on total garbage', () => {
    expect(() => extractJsonObject('not json at all')).toThrow(LlmJsonError)
  })
})

describe('parseInferenceResponse', () => {
  const one = (overrides: Record<string, unknown> = {}) => ({
    labelZh: '第二型糖尿病',
    labelEn: 'Type 2 diabetes',
    inferenceConfidence: 'high',
    ...overrides,
  })

  it('parses a well-formed problems array', () => {
    const raw = JSON.stringify({ problems: [one()] })
    const rows = parseInferenceResponse(raw)
    expect(rows).toHaveLength(1)
    expect(rows[0].labelEn).toBe('Type 2 diabetes')
    expect(rows[0].inferenceConfidence).toBe('high')
  })

  it('accepts a bare top-level array', () => {
    const raw = JSON.stringify([one()])
    expect(parseInferenceResponse(raw)).toHaveLength(1)
  })

  it('falls back to the first array-valued property', () => {
    const raw = JSON.stringify({ items: [one()] })
    expect(parseInferenceResponse(raw)).toHaveLength(1)
  })

  it('applies schema defaults for missing optional fields', () => {
    const raw = JSON.stringify({ problems: [{ labelEn: 'Hypertension' }] })
    const rows = parseInferenceResponse(raw)
    expect(rows[0].inferenceConfidence).toBe('medium')
    expect(rows[0].supportingEvidence).toEqual([])
    expect(rows[0].labelZh).toBe('')
  })

  it('drops a row with no label of any kind', () => {
    const raw = JSON.stringify({ problems: [{ rationale: 'orphan' }, one()] })
    const rows = parseInferenceResponse(raw)
    expect(rows).toHaveLength(1)
    expect(rows[0].labelEn).toBe('Type 2 diabetes')
  })

  it('drops a single malformed row but keeps the good ones', () => {
    const raw = JSON.stringify({
      problems: [one(), { labelEn: 123, inferenceConfidence: 'high' }, one({ labelEn: 'CKD' })],
    })
    const rows = parseInferenceResponse(raw)
    expect(rows.map((r) => r.labelEn)).toEqual(['Type 2 diabetes', 'CKD'])
  })

  it('ignores unknown/legacy fields (e.g. a stray code) and keeps the labelled row', () => {
    const raw = JSON.stringify({
      problems: [one({ suggestedSnomed: { display: 'no code here' } })],
    })
    const rows = parseInferenceResponse(raw)
    expect(rows).toHaveLength(1)
    expect(rows[0]).not.toHaveProperty('suggestedSnomed')
  })

  it('returns [] on total garbage', () => {
    expect(parseInferenceResponse('hello world')).toEqual([])
  })

  it('returns [] when problems is not an array', () => {
    expect(parseInferenceResponse(JSON.stringify({ problems: 'oops' }))).toEqual([])
  })
})
