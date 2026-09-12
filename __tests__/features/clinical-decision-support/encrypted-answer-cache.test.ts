import { loadEncryptedCache, saveEncryptedCache } from '@/src/infrastructure/cache/encrypted-session-cache'
import { clearSessionBundleKey } from '@/src/infrastructure/fhir/services/bundle-crypto'
import { expectSealedEnvelope, useRealWebCrypto } from './encrypted-answers.helper'

describe('encrypted clinical answers with real AES-GCM', () => {
  useRealWebCrypto()
  const key = 'synthetic-af-cache-test'

  it('round trips a serialized envelope rather than the in-memory crypto record', async () => {
    const answer = { decision: 'reviewed', patient: 'synthetic-af-test' }
    await saveEncryptedCache(key, answer)
    expectSealedEnvelope(localStorage.getItem(key)!, ['reviewed', 'synthetic-af-test'])
    await expect(loadEncryptedCache(key, 60000)).resolves.toEqual(answer)
  })

  it('cannot read another session’s answers and purges only the unreadable entry', async () => {
    await saveEncryptedCache(key, { decision: 'reviewed' })
    localStorage.setItem('unrelated-test-entry', 'keep')
    clearSessionBundleKey()
    await expect(loadEncryptedCache(key, 60000)).resolves.toBeNull()
    expect(localStorage.getItem(key)).toBeNull()
    expect(localStorage.getItem('unrelated-test-entry')).toBe('keep')
  })

  it('rejects modified ciphertext through real authentication', async () => {
    await saveEncryptedCache(key, { decision: 'reviewed' })
    const envelope = JSON.parse(localStorage.getItem(key)!)
    envelope.data = (envelope.data[0] === 'A' ? 'B' : 'A') + envelope.data.slice(1)
    localStorage.setItem(key, JSON.stringify(envelope))
    await expect(loadEncryptedCache(key, 60000)).resolves.toBeNull()
    expect(localStorage.getItem(key)).toBeNull()
  })
})
