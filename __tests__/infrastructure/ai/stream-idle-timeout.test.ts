import {
  withIdleTimeout,
  StreamIdleTimeoutError,
  resolveStreamIdleTimeoutMs,
} from '@/src/infrastructure/ai/streaming/stream-idle-timeout'

describe('withIdleTimeout', () => {
  it('passes through items that arrive within the idle window', async () => {
    async function* src() {
      yield 'a'
      yield 'b'
      yield 'c'
    }
    const out: string[] = []
    for await (const x of withIdleTimeout(src(), 1000, () => {})) out.push(x)
    expect(out).toEqual(['a', 'b', 'c'])
  })

  it('throws StreamIdleTimeoutError and aborts when the source stalls', async () => {
    let aborted = false
    // Yields one item, then never resolves again — a stalled stream.
    const stalled: AsyncIterable<string> = {
      [Symbol.asyncIterator]() {
        let n = 0
        return {
          next() {
            if (n++ === 0) return Promise.resolve({ value: 'a', done: false })
            return new Promise<IteratorResult<string>>(() => {}) // never resolves
          },
          return() {
            return Promise.resolve({ value: undefined, done: true })
          },
        }
      },
    }
    const run = (async () => {
      const out: string[] = []
      for await (const x of withIdleTimeout(stalled, 30, () => { aborted = true })) out.push(x)
      return out
    })()
    await expect(run).rejects.toBeInstanceOf(StreamIdleTimeoutError)
    expect(aborted).toBe(true)
  })

  it('propagates a real source error unchanged (not a timeout)', async () => {
    const boom = new Error('upstream 500')
    async function* src(): AsyncGenerator<string> {
      yield 'a'
      throw boom
    }
    const run = (async () => {
      const out: string[] = []
      for await (const x of withIdleTimeout(src(), 1000, () => {})) out.push(x)
      return out
    })()
    await expect(run).rejects.toBe(boom)
  })

  it('timeout message is mappable to a friendly "timed out" error', () => {
    expect(new StreamIdleTimeoutError().message).toMatch(/timed out/i)
  })
})

describe('resolveStreamIdleTimeoutMs', () => {
  it('returns a positive default when no override is set', () => {
    expect(resolveStreamIdleTimeoutMs()).toBeGreaterThan(0)
  })

  it('honours a window override', () => {
    ;(window as unknown as { __streamIdleTimeoutMs?: number }).__streamIdleTimeoutMs = 1234
    expect(resolveStreamIdleTimeoutMs()).toBe(1234)
    delete (window as unknown as { __streamIdleTimeoutMs?: number }).__streamIdleTimeoutMs
  })
})
