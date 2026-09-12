/**
 * @jest-environment jsdom
 */
/**
 * Where the DP-00/DP-01 answers are kept, and what the card may conclude from
 * their absence.
 *
 * The phenotype answer is the strongest single statement this feature stores:
 * 「這位病人的 LVEF 是 30%」, against a named patient, given by a physician. It
 * used to be written to `localStorage` as plain JSON — the finding CodeQL
 * raised — and is now sealed under this tab's session key.
 *
 * Sealing makes the read asynchronous, and that is the second thing held here.
 * 「還沒讀到」 and 「沒作答」 render the same card and mean opposite things, so
 * `hydrated` is set when the read resolves and never when it starts; a read
 * that resolves after the chart moved on is dropped; and nothing is written
 * back before a read has landed.
 */
import {
  createSessionPhenotypeAnswerRepository,
  phenotypeAnswerStorageKey,
  setPhenotypeAnswerRepository,
  createEncryptedPhenotypeAnswerRepository,
  usePhenotypeAnswerStore,
  type PhenotypeAnswer,
} from '@/features/clinical-decision-support/stores/phenotype-answer.store'
import {
  expectSealedEnvelope,
  sealAnswers,
  storedCiphertext,
  until,
  useRealWebCrypto,
} from './encrypted-answers.helper'

const AT = new Date('2026-09-12T14:20:00+08:00')

const REDUCED: PhenotypeAnswer = {
  hfSuspicion: 'suspected',
  choice: 'reduced',
  lvef: 30,
  measuredOn: '2026-02-01',
  answeredOn: '2026-09-12',
}

function store() {
  return usePhenotypeAnswerStore.getState()
}

function hydrated(patientId: string): boolean {
  return Boolean(usePhenotypeAnswerStore.getState().hydratedPatientIds[patientId])
}

function answerOf(patientId: string): PhenotypeAnswer | undefined {
  return usePhenotypeAnswerStore.getState().byPatientId[patientId]
}

describe('the phenotype answer store', () => {
  useRealWebCrypto()

  beforeEach(() => {
    localStorage.clear()
    // Restores the default after a test that swapped it, and clears the cache.
    setPhenotypeAnswerRepository(createEncryptedPhenotypeAnswerRepository())
  })

  it('stores ciphertext, never the ejection fraction itself', async () => {
    store().setAnswer('p1', REDUCED, AT)
    const raw = await storedCiphertext(phenotypeAnswerStorageKey('p1'))

    expectSealedEnvelope(raw, [
      'suspected',
      'reduced',
      'lvef',
      'measuredOn',
      '2026-02-01',
      'hfSuspicion',
    ])
  })

  it('reads the answer back after a reload of this tab', async () => {
    store().setAnswer('p1', REDUCED, AT)
    await storedCiphertext(phenotypeAnswerStorageKey('p1'))
    usePhenotypeAnswerStore.setState({ byPatientId: {}, hydratedPatientIds: {} })

    store().hydrate('p1')
    await until(() => hydrated('p1'), 'p1 to hydrate')
    expect(answerOf('p1')).toMatchObject({ choice: 'reduced', lvef: 30 })
  })

  it('is not hydrated until the read resolves, and writes nothing meanwhile', async () => {
    store().setAnswer('p1', REDUCED, AT)
    const sealed = await storedCiphertext(phenotypeAnswerStorageKey('p1'))
    usePhenotypeAnswerStore.setState({ byPatientId: {}, hydratedPatientIds: {} })

    store().hydrate('p1')
    // The card must be able to tell these apart: there is no answer in memory
    // yet, and the chart is not marked read.
    expect(answerOf('p1')).toBeUndefined()
    expect(hydrated('p1')).toBe(false)
    expect(localStorage.getItem(phenotypeAnswerStorageKey('p1'))).toBe(sealed)

    await until(() => hydrated('p1'), 'p1 to hydrate')
    expect(localStorage.getItem(phenotypeAnswerStorageKey('p1'))).toBe(sealed)
  })

  it('drops a read that resolves after the chart has moved on', async () => {
    store().setAnswer('p1', REDUCED, AT)
    store().setAnswer('p2', { ...REDUCED, choice: 'preserved', lvef: 58 }, AT)
    await storedCiphertext(phenotypeAnswerStorageKey('p1'))
    await storedCiphertext(phenotypeAnswerStorageKey('p2'))
    usePhenotypeAnswerStore.setState({ byPatientId: {}, hydratedPatientIds: {} })

    store().hydrate('p1')
    store().hydrate('p2')
    await until(() => hydrated('p2'), 'p2 to hydrate')

    // One patient's LVEF must never be sitting in the store while another's
    // chart is the one on screen.
    expect(answerOf('p1')).toBeUndefined()
    expect(hydrated('p1')).toBe(false)
    expect(answerOf('p2')).toMatchObject({ choice: 'preserved', lvef: 58 })

    store().hydrate('p1')
    await until(() => hydrated('p1'), 'p1 to hydrate on return')
    expect(answerOf('p1')).toMatchObject({ choice: 'reduced' })
  })

  it('keeps an answer given while the read was in flight', async () => {
    store().setAnswer('p1', REDUCED, AT)
    await storedCiphertext(phenotypeAnswerStorageKey('p1'))
    usePhenotypeAnswerStore.setState({ byPatientId: {}, hydratedPatientIds: {} })

    store().hydrate('p1')
    // The physician answers before the decryption lands. What they just said
    // is more recent than what storage holds.
    store().setAnswer('p1', { ...REDUCED, choice: 'preserved', lvef: 55 }, AT)
    await until(() => hydrated('p1'), 'p1 to hydrate')

    expect(answerOf('p1')).toMatchObject({ choice: 'preserved', lvef: 55 })
  })

  it('opens a first visit in the same tick, and writes nothing for it', () => {
    store().hydrate('first-visit')

    expect(hydrated('first-visit')).toBe(true)
    expect(answerOf('first-visit')).toBeUndefined()
    expect(localStorage.getItem(phenotypeAnswerStorageKey('first-visit'))).toBeNull()
  })

  it('refuses a sealed record that is not an answer this host knows', async () => {
    await sealAnswers(phenotypeAnswerStorageKey('p1'), { choice: 'teleported', lvef: 'high' })

    store().hydrate('p1')
    await until(() => hydrated('p1'), 'p1 to hydrate')
    // It decrypted; the parsing below the envelope is what refuses it.
    expect(answerOf('p1')?.choice).toBeUndefined()
    expect(answerOf('p1')?.lvef).toBeUndefined()
  })

  it('does not let an encryption still in flight undo a clear', async () => {
    store().setAnswer('p1', REDUCED, AT)
    store().clearAnswer('p1')
    store().setAnswer('p2', REDUCED, AT)
    await storedCiphertext(phenotypeAnswerStorageKey('p2'))

    expect(localStorage.getItem(phenotypeAnswerStorageKey('p1'))).toBeNull()
    expect(answerOf('p1')).toBeUndefined()
  })

  it('drops what one repository answered when another replaces it', async () => {
    store().setAnswer('p1', REDUCED, AT)
    await storedCiphertext(phenotypeAnswerStorageKey('p1'))
    usePhenotypeAnswerStore.setState({ byPatientId: {}, hydratedPatientIds: {} })

    store().hydrate('p1')
    // A read against the store being replaced is not this store's answer to
    // 「上次填了什麼」, however it resolves.
    setPhenotypeAnswerRepository(createSessionPhenotypeAnswerRepository())

    store().hydrate('p1')
    await until(() => hydrated('p1'), 'p1 to hydrate against the new repository')
    expect(answerOf('p1')).toBeUndefined()

    // And the read against the old repository stays dropped once it lands.
    await new Promise((resolve) => { setTimeout(resolve, 30) })
    expect(answerOf('p1')).toBeUndefined()
  })
})
