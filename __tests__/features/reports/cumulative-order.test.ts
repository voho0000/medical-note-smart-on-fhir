import {
  CUMULATIVE_REPORT_CATEGORY_IDS,
  DEFAULT_CUMULATIVE_CATEGORY_ORDER,
  moveCumulativeCategory,
  resolveCumulativeCategoryOrder,
} from '@/features/clinical-summary/reports/utils/cumulative-order.utils'

describe('cumulative category order', () => {
  it('ships 微生物 directly above 尿液 and drops the `other` catch-all', () => {
    const order = DEFAULT_CUMULATIVE_CATEGORY_ORDER
    expect(order).not.toContain('other')
    expect(order.indexOf('microbio')).toBe(order.indexOf('urine') - 1)
    // Everything else keeps its LAB_CATEGORIES sequence.
    expect(order.filter((id) => id !== 'microbio')).toEqual(
      CUMULATIVE_REPORT_CATEGORY_IDS.filter((id) => id !== 'microbio'),
    )
  })

  it('falls back to the default when nothing is persisted', () => {
    expect(resolveCumulativeCategoryOrder(null)).toEqual(DEFAULT_CUMULATIVE_CATEGORY_ORDER)
    expect(resolveCumulativeCategoryOrder(undefined)).toEqual(DEFAULT_CUMULATIVE_CATEGORY_ORDER)
    expect(resolveCumulativeCategoryOrder([])).toEqual(DEFAULT_CUMULATIVE_CATEGORY_ORDER)
  })

  it('honours a persisted order and appends unmentioned categories in default position', () => {
    const resolved = resolveCumulativeCategoryOrder(
      ['urine', 'chem'],
      ['cbc', 'coag', 'chem', 'urine', 'microbio'],
      ['cbc', 'coag', 'chem', 'microbio', 'urine'],
    )
    expect(resolved).toEqual(['urine', 'chem', 'cbc', 'coag', 'microbio'])
  })

  it('drops ids that no longer exist and collapses duplicates', () => {
    const resolved = resolveCumulativeCategoryOrder(
      ['chem', 'retired-panel', 'chem', 'cbc'],
      ['cbc', 'chem', 'urine'],
      ['cbc', 'chem', 'urine'],
    )
    expect(resolved).toEqual(['chem', 'cbc', 'urine'])
  })

  it('keeps a category that exists but is missing from the default order', () => {
    const resolved = resolveCumulativeCategoryOrder(
      ['chem'],
      ['chem', 'cbc', 'brand-new'],
      ['cbc', 'chem'],
    )
    expect(resolved).toEqual(['chem', 'cbc', 'brand-new'])
  })

  it('moves a category up and down, and no-ops at the ends', () => {
    const order = ['cbc', 'coag', 'chem']
    expect(moveCumulativeCategory(order, 'chem', -1)).toEqual(['cbc', 'chem', 'coag'])
    expect(moveCumulativeCategory(order, 'cbc', 1)).toEqual(['coag', 'cbc', 'chem'])
    // Same reference back on a no-op, so a caller cannot write a pointless
    // preference update or force a re-render.
    expect(moveCumulativeCategory(order, 'cbc', -1)).toBe(order)
    expect(moveCumulativeCategory(order, 'chem', 1)).toBe(order)
    expect(moveCumulativeCategory(order, 'nope', -1)).toBe(order)
    // The input is never mutated.
    expect(order).toEqual(['cbc', 'coag', 'chem'])
  })
})
