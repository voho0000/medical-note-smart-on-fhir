jest.mock('@/features/clinical-decision-support/telemetry/fhir-firebase-auth', () => ({ captureFhirFirebaseAuth: async () => ({ uid: 'owner-a', isCurrent: () => true, getToken: async () => 'synthetic-token' }) }))
const mockAccount: { user: { uid: string } | null; loading: boolean } = { user: { uid: 'owner-a' }, loading: false }
jest.mock('@/src/application/providers/auth.provider', () => ({ useAuth: () => mockAccount }))
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { webcrypto } from 'node:crypto'
import { cdssPatientIdentity } from '@/features/clinical-decision-support/telemetry/patient-identity'
import { readCdssHistory } from '@/features/clinical-decision-support/telemetry/cdss-history'
import { CdssStorageActions } from '@/features/clinical-decision-support/renderers/CdssStorageActions'
import { cdssGatewaySaveSchema } from '@/src/shared/contracts/cdss-gateway-event'
import { storedTimestampForDisplay } from '@/src/shared/contracts/cdss-stored-save-v2'

const patient = { id: 'review-synthetic', resourceType: 'Patient' as const, name: [{ text: '測試病人' }],
  birthDate: '1970-01-01', identifier: [{ system: 'https://synthetic.invalid/national-id', value: 'A123XXXXXX' }] }
const saveId = '11111111-1111-4111-8111-111111111111'
const index = { saveId, documentId: '1', patientId: '2', receivedAt: '2026-10-03T00:00:00Z', packId: 'synthetic', versionId: '1' }
const result = { packId: 'synthetic', packVersion: '1', title: 'Synthetic assessment', summary: 'Synthetic summary',
  recommendations: [{ moduleName: 'Synthetic module', title: 'SAVED_DECISION_TITLE', status: 'needs-data',
    recommendation: 'SAVED_PRIMARY_RECOMMENDATION', rationale: 'SAVED_RATIONALE',
    safetyBoundary: 'SAVED_SAFETY_BOUNDARY', missingData: ['SAVED_MISSING_DATA'],
    patientEvidence: [{ label: 'SAVED_EVIDENCE', value: 'SAVED_EVIDENCE_VALUE' }], nextActions: ['SAVED_NEXT_ACTION'] }] }
const response = (data: unknown) => ({ status: 200, body: new ReadableStream({ start(controller) {
  controller.enqueue(new TextEncoder().encode(JSON.stringify(data))); controller.close()
} }) }) as Response
async function detail(patch = {}) {
  const identity = await cdssPatientIdentity(patient)
  const save = { ...identity, schema_version: 2, save_id: saveId, saved_at: index.receivedAt, site: 'vghtpe',
    patient_session_id: saveId, pack_id: 'synthetic', app_version: '0.0.0', build_revision: 'unknown',
    profile: { facts: { synthetic: true } }, result, physician_inputs: {}, physician_decisions: {}, source_records: [], events: [], ...patch }
  return { ...index, savedAt: save.saved_at, save }
}
beforeEach(() => {
  Object.defineProperty(globalThis.crypto, 'subtle', { configurable: true, value: webcrypto.subtle })
  if (!AbortSignal.timeout) Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: () => new AbortController().signal })
  if (!AbortSignal.any) Object.defineProperty(AbortSignal, 'any', { configurable: true, value: (signals: AbortSignal[]) => signals[0] })
  process.env.NEXT_PUBLIC_CDSS_ADMISSION = 'intranet-pilot'
  window.history.replaceState({}, '', '/?site=vghtpe')
  jest.mocked(fetch).mockReset()
})
afterEach(() => { delete process.env.NEXT_PUBLIC_CDSS_ADMISSION })

test.each([
  ['legacy UUID', { patient_session_id: 'ABCDEFAB-1234-0000-0000-ABCDEFABCDEF' }],
  ['compact time offset', { saved_at: '2026-10-03T12:34+0800' }],
  ['minute precision UTC', { saved_at: '2026-10-03T12:34Z' }],
  ['legacy event times', { events: [
    { kind: 'interaction', pack_id: 'synthetic', action: 'disease_selected', occurred_at: '2026-10-03T12:34+0800' },
    { kind: 'assessment', pack_id: 'synthetic', occurred_at: '2026-10-03T12:34Z',
      changes: [{ field_id: 'synthetic', value: true, measured_on: '2024-02-29' }] },
  ] }],
])('server-supported v2 history remains readable: %s', async (_label, patch) => {
  const stored = await detail(patch)
  jest.mocked(fetch).mockResolvedValueOnce(response(stored))
  await expect(readCdssHistory(patient, saveId, new AbortController().signal)).resolves.toEqual(stored)
})

test.each([
  ['unknown version', { schema_version: 3 }],
  ['malformed UUID', { patient_session_id: 'not-a-uuid' }],
  ['invalid timestamp', { saved_at: '2026-02-30T12:34+0800' }],
  ['invalid event date', { events: [{ kind: 'assessment', pack_id: 'synthetic', occurred_at: index.receivedAt,
    changes: [{ field_id: 'synthetic', value: true, measured_on: '2026-02-30' }] }] }],
  ['missing clinical facts', { profile: { facts: {} } }],
  ['mismatched result pack', { result: { ...result, packId: 'other' } }],
  ['unexpected saved field', { future_field: true }],
])('unsupported or corrupt snapshots remain unavailable: %s', async (_label, patch) => {
  jest.mocked(fetch).mockResolvedValueOnce(response(await detail(patch)))
  await expect(readCdssHistory(patient, saveId, new AbortController().signal)).rejects.toThrow()
})

test('historical compatibility does not loosen the current writer', async () => {
  expect(cdssGatewaySaveSchema.safeParse((await detail()).save).success).toBe(true)
  for (const patch of [{ patient_session_id: 'ABCDEFAB-1234-0000-0000-ABCDEFABCDEF' }, { saved_at: '2026-10-03T12:34+0800' }]) {
    expect(cdssGatewaySaveSchema.safeParse((await detail(patch)).save).success).toBe(false)
  }
})

test('deep and oversized snapshots fail within the frozen reader bounds', async () => {
  let nested: unknown = true
  for (let index = 0; index < 65; index++) nested = { nested }
  for (const patch of [{ physician_inputs: { nested } }, { physician_inputs: { nodes: Array(100_001).fill(null) } },
    { physician_inputs: { note: 'x'.repeat(4 * 1024 * 1024) } }]) {
    jest.mocked(fetch).mockResolvedValueOnce(response(await detail(patch)))
    await expect(readCdssHistory(patient, saveId, new AbortController().signal)).rejects.toThrow('cdss_history_unavailable')
  }
})

test.each([false, true])('saved detail presents the full stored recommendation and normalizes only display time (english=%s)', async english => {
  const stored = await detail({ saved_at: '2026-10-03T12:34+0800' })
  const originalSnapshot = JSON.stringify(stored)
  const sourceRecords = jest.fn(() => [])
  const input: Parameters<typeof CdssStorageActions>[0]['input'] = {
    patient, packId: 'synthetic', profile: { id: patient.id, facts: {} },
    result: { packId: 'synthetic', packVersion: '2', title: 'CURRENT_ASSESSMENT_TITLE', summary: 'CURRENT_ASSESSMENT_SUMMARY',
      recommendations: [], notEvaluated: [], disclaimer: 'Synthetic current assessment' },
    physicianInputs: { note: 'CURRENT_INPUT' }, physicianDecisions: {},
  }
  const originalInput = JSON.stringify(input)
  jest.mocked(fetch).mockImplementation(async url => response(String(url).endsWith('/read') ? stored : { records: [index], hasMore: false }))
  render(<CdssStorageActions input={input} sourceRecords={sourceRecords} english={english} />)
  fireEvent.click(screen.getByTestId('cdss-history-records'))
  fireEvent.click(await screen.findByRole('button', { name: /synthetic/ }))
  await waitFor(() => expect(screen.getByText('SAVED_NEXT_ACTION')).toBeInTheDocument())
  for (const value of ['Synthetic module', 'SAVED_PRIMARY_RECOMMENDATION', 'SAVED_DECISION_TITLE', 'needs-data',
    'SAVED_RATIONALE', 'SAVED_SAFETY_BOUNDARY', 'SAVED_MISSING_DATA', 'SAVED_EVIDENCE', 'SAVED_EVIDENCE_VALUE']) {
    expect(screen.getByText(value)).toBeVisible()
  }
  const displayedTime = new Date(storedTimestampForDisplay(stored.savedAt)).toLocaleString(english ? 'en' : 'zh-TW')
  // ICU can emit thin/non-breaking spaces. Compare the exact localized text
  // without Testing Library replacing those spaces only on the DOM side.
  expect(screen.getByText(`${english ? 'Saved at: ' : '儲存時間：'}${displayedTime}`, { normalizer: value => value })).toBeVisible()
  expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument()
  expect(screen.queryByText('CURRENT_ASSESSMENT_TITLE')).not.toBeInTheDocument()
  expect(screen.queryByText('CURRENT_INPUT')).not.toBeInTheDocument()
  expect(JSON.stringify(stored)).toBe(originalSnapshot)
  expect(JSON.stringify(input)).toBe(originalInput)
  expect(sourceRecords).not.toHaveBeenCalled()
  expect(jest.mocked(fetch).mock.calls.map(([url]) => String(url))).toEqual([
    'http://127.0.0.1:8098/cdss/v1/history', 'http://127.0.0.1:8098/cdss/v1/history/read',
  ])
})


test('switching accounts clears open history and aborts an in-flight detail read', async () => {
  mockAccount.user = { uid: 'owner-a' }
  const stored = await detail()
  let detailSignal: AbortSignal | undefined
  let finish!: (value: Response) => void
  jest.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url).endsWith('/read')) {
      detailSignal = init?.signal as AbortSignal
      return new Promise<Response>(resolve => { finish = resolve })
    }
    return response({ records: [index], hasMore: false })
  })
  const input: Parameters<typeof CdssStorageActions>[0]['input'] = { patient, packId: 'synthetic',
    profile: { id: patient.id, facts: {} }, result: { packId: 'synthetic', packVersion: '1', title: 'Current', summary: '',
      recommendations: [], notEvaluated: [], disclaimer: '' }, physicianInputs: {}, physicianDecisions: {} }
  const view = render(<CdssStorageActions input={input} sourceRecords={() => []} />)
  fireEvent.click(screen.getByTestId('cdss-history-records'))
  fireEvent.click(await screen.findByRole('button', { name: /synthetic/ }))
  await waitFor(() => expect(detailSignal).toBeDefined())
  mockAccount.user = { uid: 'owner-b' }
  view.rerender(<CdssStorageActions input={input} sourceRecords={() => []} />)
  expect(detailSignal?.aborted).toBe(true)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  finish(response(stored))
  await waitFor(() => expect(screen.queryByText('SAVED_NEXT_ACTION')).not.toBeInTheDocument())
  expect(screen.getByTestId('cdss-history-records')).toBeEnabled()
  view.unmount(); mockAccount.user = { uid: 'owner-a' }
})
