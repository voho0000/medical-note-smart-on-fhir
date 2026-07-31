import {
  BRIDGE_PROCEDURE_CLASSIFICATION_SYSTEM,
  FHIR_PROCEDURE_CATEGORY_SYSTEM,
  getProcedureCategoryCode,
} from '@/features/clinical-summary/reports/utils/procedure-category'

describe('getProcedureCategoryCode', () => {
  it.each([
    'surgical-procedure',
    'major-procedure',
    'outpatient-treatment',
  ] as const)('reads the Bridge %s classification', (code) => {
    expect(getProcedureCategoryCode({
      coding: [{
        system: BRIDGE_PROCEDURE_CLASSIFICATION_SYSTEM,
        code,
      }],
    })).toBe(code)
  })

  it('accepts the official FHIR surgical category coding as a fallback', () => {
    expect(getProcedureCategoryCode({
      coding: [{
        system: FHIR_PROCEDURE_CATEGORY_SYSTEM,
        code: 'surgical-procedure',
      }],
    })).toBe('surgical-procedure')
  })

  it('does not infer a category from text or an unrelated CodeSystem', () => {
    expect(getProcedureCategoryCode({
      text: '手術',
      coding: [{
        system: 'https://example.test/CodeSystem/local',
        code: 'major-procedure',
      }],
    })).toBeUndefined()
  })
})
