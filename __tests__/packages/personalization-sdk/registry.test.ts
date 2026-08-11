import {
  createPackRegistry,
  PersonalizationSdkError,
  type VersionedPersonalizationPack,
} from '@voho0000/personalization-sdk'

interface TestPack extends VersionedPersonalizationPack {
  run(): string
}

function createRegistry() {
  return createPackRegistry<TestPack>({
    packKind: 'care',
    validate(pack) {
      if (typeof pack.run !== 'function') {
        throw new PersonalizationSdkError('INVALID_PACK', 'run() is required')
      }
    },
  })
}

describe('personalization pack registry', () => {
  it('registers an external pack with its audit source', () => {
    const registry = createRegistry()
    const pack: TestPack = { id: 'ckd', version: '1.2.3', run: () => 'ok' }

    registry.register([pack], { source: '@voho0000@voho0000/personalized-care@1.2.3' })

    expect(registry.get('ckd')).toBe(pack)
    expect(registry.getRegistrations()).toEqual([{
      pack,
      source: '@voho0000@voho0000/personalized-care@1.2.3',
    }])
  })

  it('rejects a conflicting pack id instead of silently changing clinical logic', () => {
    const registry = createRegistry()
    registry.register(
      [{ id: 'ckd', version: '1.0.0', run: () => 'first' }],
      { source: 'care-a' },
    )

    expect(() => registry.register(
      [{ id: 'ckd', version: '2.0.0', run: () => 'second' }],
      { source: 'care-b' },
    )).toThrow(expect.objectContaining({ code: 'DUPLICATE_PACK_ID' }))
  })

  it('rejects invalid versions and unsupported contract versions', () => {
    const registry = createRegistry()

    expect(() => registry.register(
      [{ id: 'dm', version: 'latest', run: () => 'bad' }],
      { source: 'education-a' },
    )).toThrow(expect.objectContaining({ code: 'INVALID_PACK' }))

    expect(() => registry.register(
      [{
        id: 'dm',
        version: '1.0.0',
        contractVersion: '2',
        run: () => 'bad',
      } as unknown as TestPack],
      { source: 'education-a' },
    )).toThrow(expect.objectContaining({ code: 'INVALID_PACK' }))
  })
})
