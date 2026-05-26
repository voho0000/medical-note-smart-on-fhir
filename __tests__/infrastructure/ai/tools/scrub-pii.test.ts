import { scrubPii } from '@/src/infrastructure/ai/tools/_scrub-pii'

describe('scrubPii', () => {
  it('strips top-level id when sibling has gender (patient context)', () => {
    const out: any = scrubPii({ gender: 'male', id: 'patient-001', age: 50 })
    expect(out.id).toBeUndefined()
    expect(out.gender).toBe('male')
    expect(out.age).toBe(50)
  })

  it('strips birthDate at any depth', () => {
    const out: any = scrubPii({ data: { patient: { birthDate: '1950-01-01', age: 75 } } })
    expect(out.data.patient.birthDate).toBeUndefined()
    expect(out.data.patient.age).toBe(75)
  })

  it('strips identifier at top level', () => {
    const out: any = scrubPii({ identifier: [{ value: 'NHI-123' }], gender: 'male' })
    expect(out.identifier).toBeUndefined()
    expect(out.gender).toBe('male')
  })

  it('strips display under performer / participant / serviceProvider', () => {
    const input = {
      data: {
        performer: [{ actor: { display: 'Dr. Wang' } }],
        participant: [{ individual: { display: 'Dr. Lin' } }],
        serviceProvider: { display: '長庚嘉義' },
      },
    }
    const out: any = scrubPii(input)
    // actor is under performer → its display gets stripped via actor-parent rule
    expect(out.data.performer[0].actor.display).toBeUndefined()
    expect(out.data.participant[0].individual.display).toBeUndefined()
    expect(out.data.serviceProvider.display).toBeUndefined()
  })

  it('keeps `display` under code (clinical concept, not a person)', () => {
    const out: any = scrubPii({
      data: { code: { coding: [{ code: 'I50.9', display: 'Heart failure' }] } },
    })
    expect(out.data.code.coding[0].display).toBe('Heart failure')
  })

  it('keeps department / institution string values (not nested display)', () => {
    const out: any = scrubPii({
      data: { department: '住院', institution: '長庚嘉義' },
    })
    expect(out.data.department).toBe('住院')
    expect(out.data.institution).toBe('長庚嘉義')
  })

  it('keeps numeric counts and dates unchanged', () => {
    const out: any = scrubPii({
      data: { count: 135, range: { earliest: '2020-01-01', latest: '2026-05-01' } },
    })
    expect(out.data.count).toBe(135)
    expect(out.data.range.earliest).toBe('2020-01-01')
  })

  it('handles arrays of objects with parent-scoped stripping', () => {
    const out: any = scrubPii({
      data: {
        performer: [
          { actor: { display: 'Dr. A' } },
          { actor: { display: 'Dr. B' } },
        ],
      },
    })
    expect(out.data.performer[0].actor.display).toBeUndefined()
    expect(out.data.performer[1].actor.display).toBeUndefined()
  })

  it('does not strip non-id fields named "id" at top level when no gender sibling', () => {
    // e.g. queryEncounters returns encounterId — not stripped because not a patient-shaped object
    const out: any = scrubPii({ encounterId: 'enc-1', date: '2025-05-18' })
    expect(out.encounterId).toBe('enc-1')
  })
})
