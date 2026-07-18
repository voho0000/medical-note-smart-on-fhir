import { serializeLocalBundleMutation } from '@/src/infrastructure/fhir/services/local-bundle-mutation-queue'

describe('serializeLocalBundleMutation', () => {
  it('finishes overlapping Bundle mutations in call order', async () => {
    const order: string[] = []
    let releaseFirst!: () => void
    const first = serializeLocalBundleMutation(async () => {
      order.push('first:start')
      await new Promise<void>((resolve) => { releaseFirst = resolve })
      order.push('first:end')
    })
    const second = serializeLocalBundleMutation(async () => {
      order.push('second:start')
      order.push('second:end')
    })

    await Promise.resolve()
    expect(order).toEqual(['first:start'])
    releaseFirst()
    await Promise.all([first, second])

    expect(order).toEqual([
      'first:start',
      'first:end',
      'second:start',
      'second:end',
    ])
  })

  it('continues after a failed mutation', async () => {
    await expect(serializeLocalBundleMutation(async () => {
      throw new Error('save failed')
    })).rejects.toThrow('save failed')

    await expect(serializeLocalBundleMutation(async () => 'cleared')).resolves.toBe('cleared')
  })
})
