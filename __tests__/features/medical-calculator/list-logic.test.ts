import { CALCULATORS } from '@/features/medical-calculator/calculators'
import {
  forAudience,
  specialtiesPresent,
  makeMatcher,
  buildCalcList,
  CATEGORY_ORDER,
} from '@/features/medical-calculator/list-logic'

describe('forAudience', () => {
  it('medical mode shows every calculator', () => {
    expect(forAudience(CALCULATORS, 'medical')).toHaveLength(CALCULATORS.length)
  })
  it('patient mode shows only patient/both calculators (e.g. GDS-15, BMI, not FENa)', () => {
    const ids = forAudience(CALCULATORS, 'patient').map((c) => c.id)
    expect(ids).toContain('gds-15')
    expect(ids).toContain('bmi')
    expect(ids).not.toContain('fena')
    expect(ids.length).toBeLessThan(CALCULATORS.length)
  })
})

describe('specialtiesPresent', () => {
  it('returns categories in canonical order, only those present', () => {
    const cats = specialtiesPresent(CALCULATORS)
    expect(cats).toEqual(CATEGORY_ORDER.filter((c) => cats.includes(c)))
    expect(cats).toContain('renal')
    // patient audience has far fewer specialties
    const patientCats = specialtiesPresent(forAudience(CALCULATORS, 'patient'))
    expect(patientCats.length).toBeLessThan(cats.length)
  })
})

describe('makeMatcher', () => {
  it('empty query matches everything', () => {
    const m = makeMatcher('')
    expect(CALCULATORS.every(m)).toBe(true)
  })
  it('matches a disease tag, not just the title (中風 → stroke scores)', () => {
    const m = makeMatcher('中風')
    const hits = CALCULATORS.filter(m).map((c) => c.id)
    expect(hits).toContain('cha2ds2-vasc')
    expect(hits).toContain('nihss')
  })
  it('matches the calculator id and English name', () => {
    expect(CALCULATORS.filter(makeMatcher('meld')).map((c) => c.id)).toContain('meld-na')
    expect(CALCULATORS.filter(makeMatcher('anion gap')).map((c) => c.id)).toContain('anion-gap')
  })
})

describe('buildCalcList', () => {
  const base = { calcs: CALCULATORS, query: '', favorites: [] as string[], recent: [] as string[] }

  it('"all" groups by specialty in canonical order, no empty groups', () => {
    const list = buildCalcList({ ...base, filter: 'all' })
    expect(list.mode).toBe('grouped')
    const order = list.grouped.map((g) => g.cat)
    expect(order).toEqual(CATEGORY_ORDER.filter((c) => order.includes(c)))
    expect(list.grouped.every((g) => g.items.length > 0)).toBe(true)
    // every calculator appears exactly once across the groups
    const total = list.grouped.reduce((n, g) => n + g.items.length, 0)
    expect(total).toBe(CALCULATORS.length)
  })

  it('a specialty filter narrows to that one category', () => {
    const list = buildCalcList({ ...base, filter: 'renal' })
    expect(list.grouped.map((g) => g.cat)).toEqual(['renal'])
    expect(list.grouped[0].items.every((c) => c.category === 'renal')).toBe(true)
  })

  it('favorites/recent are a FLAT list in curation order (not grouped)', () => {
    const fav = buildCalcList({ ...base, filter: 'favorites', favorites: ['bmi', 'meld-na', 'fena'] })
    expect(fav.mode).toBe('flat')
    expect(fav.flat.map((c) => c.id)).toEqual(['bmi', 'meld-na', 'fena'])
  })

  it('skips favorite/recent ids that no longer exist', () => {
    const fav = buildCalcList({ ...base, filter: 'favorites', favorites: ['bmi', 'nonexistent-calc', 'fena'] })
    expect(fav.flat.map((c) => c.id)).toEqual(['bmi', 'fena'])
  })

  it('applies the search query on top of the filter', () => {
    const list = buildCalcList({ ...base, filter: 'all', query: 'FENa' })
    const ids = list.grouped.flatMap((g) => g.items.map((c) => c.id))
    expect(ids).toContain('fena')
    expect(ids).not.toContain('bmi')
  })

  it('"patient" filter keeps only patient-fillable calcs, grouped across specialties', () => {
    const list = buildCalcList({ ...base, filter: 'patient' })
    expect(list.mode).toBe('grouped')
    const items = list.grouped.flatMap((g) => g.items)
    expect(items.length).toBeGreaterThan(0)
    // every shown calc is patient/both
    expect(items.every((c) => c.audience === 'patient' || c.audience === 'both')).toBe(true)
    const ids = items.map((c) => c.id)
    expect(ids).toContain('gds-15')
    expect(ids).toContain('bmi')
    expect(ids).not.toContain('fena') // medical-only
    // spans more than one specialty (mental, general, …)
    expect(list.grouped.length).toBeGreaterThan(1)
  })

  it('"patient" filter still honours the search query', () => {
    const list = buildCalcList({ ...base, filter: 'patient', query: 'PHQ' })
    const ids = list.grouped.flatMap((g) => g.items.map((c) => c.id))
    expect(ids).toContain('phq-9')
    expect(ids).not.toContain('gds-15')
  })

  it('"relevant" returns a FLAT list of score>0 calcs, highest score first', () => {
    const relevance = new Map<string, number>([
      ['bmi', 2001],       // computable
      ['meld-na', 1003],   // data-complete
      ['fena', 0],         // no data → excluded
    ])
    const list = buildCalcList({ ...base, filter: 'relevant', relevance })
    expect(list.mode).toBe('flat')
    expect(list.flat.map((c) => c.id)).toEqual(['bmi', 'meld-na'])
  })

  it('"relevant" applies the search query and excludes zero-score calcs', () => {
    const relevance = new Map<string, number>([['bmi', 2001], ['meld-na', 1003]])
    const list = buildCalcList({ ...base, filter: 'relevant', relevance, query: 'MELD' })
    expect(list.flat.map((c) => c.id)).toEqual(['meld-na'])
  })

  it('"relevant" with no relevance map yields an empty list', () => {
    const list = buildCalcList({ ...base, filter: 'relevant' })
    expect(list.flat).toEqual([])
  })
})
