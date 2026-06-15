import {
  partitionByEncounterLink,
  isEncounterLinked,
  encounterIdSet,
} from '@/src/core/utils/encounter-link.utils'

const encounters = [{ id: 'enc1' }, { id: 'enc2' }]

const items = [
  { id: 'opd', encounter: { reference: 'Encounter/enc1' } }, // linked (slash form)
  { id: 'adm', encounter: { reference: 'enc2' } }, // linked (bare id)
  { id: 'pharmacy' }, // orphan: no encounter at all
  { id: 'dangling', encounter: { reference: 'Encounter/gone' } }, // orphan: dangling ref
]

describe('encounter-link.utils', () => {
  it('builds the encounter id set, ignoring blanks', () => {
    const ids = encounterIdSet([{ id: 'a' }, {}, { id: 'b' }])
    expect([...ids].sort()).toEqual(['a', 'b'])
  })

  it('isEncounterLinked matches slash and bare id refs', () => {
    const ids = encounterIdSet(encounters)
    expect(isEncounterLinked({ encounter: { reference: 'Encounter/enc1' } }, ids)).toBe(true)
    expect(isEncounterLinked({ encounter: { reference: 'enc2' } }, ids)).toBe(true)
    expect(isEncounterLinked({ encounter: { reference: 'Encounter/gone' } }, ids)).toBe(false)
    expect(isEncounterLinked({}, ids)).toBe(false)
  })

  it('partitions visit-linked vs orphan (pharmacy + dangling)', () => {
    const { linked, orphan } = partitionByEncounterLink(items, encounters)
    expect(linked.map((m) => m.id)).toEqual(['opd', 'adm'])
    expect(orphan.map((m) => m.id)).toEqual(['pharmacy', 'dangling'])
  })

  it('treats everything as orphan when there are no encounters', () => {
    const { linked, orphan } = partitionByEncounterLink(items, [])
    expect(linked).toHaveLength(0)
    expect(orphan).toHaveLength(4)
  })
})
