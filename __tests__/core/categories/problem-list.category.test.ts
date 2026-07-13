import { problemListCategory } from '@/src/core/categories/problem-list.category'

describe('problemListCategory', () => {
  it('accepts a category-less standing condition but excludes an encounter diagnosis', () => {
    const extracted = problemListCategory.extractData({
      conditions: [
        { id: 'standing', code: { text: 'Hypertension' } },
        { id: 'visit-only', encounter: { reference: 'Encounter/1' }, code: { text: 'Rule-out pneumonia' } },
      ],
    } as any)

    expect(extracted.map((condition: any) => condition.id)).toEqual(['standing'])
  })

  it('excludes refuted and entered-in-error conditions from active problems', () => {
    const data = [
      { id: 'active', code: { text: 'Diabetes' }, clinicalStatus: 'active', verificationStatus: 'confirmed' },
      { id: 'refuted', code: { text: 'Not asthma' }, clinicalStatus: 'active', verificationStatus: 'refuted' },
      { id: 'error', code: { text: 'Wrong diagnosis' }, clinicalStatus: 'active', verificationStatus: 'entered-in-error' },
    ] as any

    expect(problemListCategory.getCount(data, { problemListStatus: 'active', problemListTimeRange: 'all' })).toBe(1)
    const section = problemListCategory.getContextSection(data, { problemListStatus: 'active', problemListTimeRange: 'all' }) as any
    expect(section?.items)
      .toEqual(['Diabetes [verification: confirmed]'])
  })
})
