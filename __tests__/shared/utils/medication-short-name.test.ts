import { formatIngredientStrength } from '@/src/shared/utils/medication-short-name'

describe('formatIngredientStrength', () => {
  it('turns the drug master ingredient into a short label', () => {
    expect(formatIngredientStrength('ACETYLCYSTEINE 600 MG')).toBe('Acetylcysteine 600 mg')
    expect(formatIngredientStrength('SODIUM CHLORIDE 0.9 %')).toBe('Sodium Chloride 0.9 %')
    expect(formatIngredientStrength('TRAMADOL HCL 50 MG/ML')).toBe('Tramadol HCl 50 mg/mL')
    expect(formatIngredientStrength('LEVOTHYROXINE SODIUM .1 MG')).toBe('Levothyroxine Sodium 0.1 mg')
  })

  it('keeps every component of a combination', () => {
    expect(formatIngredientStrength('AMLODIPINE 5 MG; VALSARTAN 80 MG')).toBe('Amlodipine 5 mg + Valsartan 80 mg')
  })

  it('leaves an ingredient without strength readable and empty input empty', () => {
    expect(formatIngredientStrength('FLURBIPROFEN')).toBe('Flurbiprofen')
    expect(formatIngredientStrength('  ')).toBeUndefined()
    expect(formatIngredientStrength(undefined)).toBeUndefined()
  })
})
