import type { CdssPatientProfile, CdssResult } from '@voho0000/personalized-care'
import { createHash, webcrypto } from 'node:crypto'
import { cancelCdssGatewayRequests, cdssGatewayStatus, recordCdssEvent, saveCdssSnapshot } from '@/features/clinical-decision-support/telemetry/cdss-gateway'
import { cdssGatewaySaveSchema } from '@/src/shared/contracts/cdss-gateway-event'

const mockGetToken = jest.fn()
jest.mock('@/src/application/telemetry/cdss-auth', () => ({
  captureCollectorAuth: jest.fn(async () => ({ getToken: mockGetToken })),
}))

const input = {
  patient: {
    id: 'raw-patient-id', resourceType: 'Patient' as const,
    name: [{ text: '陳小華' }], birthDate: '1968-05-09',
    identifier: [{ system: 'https://example.org/national-id', value: 'A123XXXXXX' }],
  },
  packId: 'heart-failure-cdss',
  profile: { id: 'raw-patient-id', facts: { ldl: { zh: 'LDL', en: 'LDL', numericValue: 92,
    sources: [{ resourceType: 'Observation', resourceId: 'outside-lab', facility: '臺大醫院' }] },
    age: { zh: '68', en: '68', sources: [{ resourceType: 'Patient', resourceId: 'raw-patient-id' }] },
  } } as CdssPatientProfile,
  result: { packId: 'heart-failure-cdss', packVersion: '1', title: 'HF', summary: 'assessment', recommendations: [], notEvaluated: [], disclaimer: '' } as CdssResult,
  physicianInputs: { manualLvef: 52 },
  physicianDecisions: { module: { decision: 'reviewed', note: 'clinician text 陳小華 1968-05-09' } },
  sourceRecords: [{ resource_type: 'Observation', resource_id: 'outside-lab', source_institution: '臺大醫院', source_system: null }],
}

beforeEach(() => {
  Object.defineProperty(globalThis.crypto, 'subtle', { configurable: true, value: webcrypto.subtle })
  cancelCdssGatewayRequests()
  mockGetToken.mockReset().mockResolvedValue('synthetic-firebase-token')
  jest.mocked(fetch).mockReset().mockImplementation(async (_url, init) => {
    const body = JSON.parse(init?.body as string)
    return { status: 201, json: async () => ({ status: 'stored', save_id: body.save_id }) } as Response
  })
  delete process.env.NEXT_PUBLIC_COLLECTOR_ORIGIN
  window.history.replaceState({}, '', '/app/?site=vghtpe')
})

afterEach(() => cancelCdssGatewayRequests())

test('explicit intranet pilot saves without a Firebase identity or an invented clinician', async () => {
  process.env.NEXT_PUBLIC_CDSS_ADMISSION = 'intranet-pilot'
  try {
    await saveCdssSnapshot(input)
    expect(mockGetToken).not.toHaveBeenCalled()
    const request = jest.mocked(fetch).mock.calls[0][1]!
    expect(request.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(request.body as string).actor_uid).toBeUndefined()
  } finally { delete process.env.NEXT_PUBLIC_CDSS_ADMISSION }
})

test('records clicks locally and sends all used data only on explicit save', async () => {
  recordCdssEvent(input.patient.id, input.packId, { kind: 'assessment', changes: [{ field_id: 'hf-suspicion', value: 'suspected' }] })
  expect(fetch).not.toHaveBeenCalled()
  expect(cdssGatewayStatus().pending_events).toBe(1)
  await saveCdssSnapshot(input)
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:8787/cdss/v1/saves', expect.objectContaining({
    credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store',
  }))
  const request = jest.mocked(fetch).mock.calls[0][1]!
  expect(request.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer synthetic-firebase-token' }))
  const body = JSON.parse(request.body as string)
  expect(cdssGatewaySaveSchema.safeParse(body).success).toBe(true)
  expect(body.profile.facts.ldl.numericValue).toBe(92)
  expect(body.source_records[0].source_institution).toBe('臺大醫院')
  expect(body.physician_inputs.manualLvef).toBe(52)
  expect(body.physician_decisions.module.note).toBe('clinician text [已遮蔽] [已遮蔽]')
  expect(body.events).toHaveLength(1)
  expect(body.patient_session_id).toMatch(/^[0-9a-f-]{36}$/)
  expect(body.schema_version).toBe(2)
  expect(body.patient_identity).toEqual({
    name_masked: '陳○華', birth_year: '1968',
    identifier_masked: 'A123XXXXXX', identifier_system: 'https://example.org/national-id',
  })
  const tuple = JSON.stringify([1, 'vghtpe', '陳小華', '1968-05-09', 'https://example.org/national-id', 'A123XXXXXX'])
  expect(body.patient_key_sha256).toBe(createHash('sha256').update(tuple).digest('hex'))
  expect(body.profile.id).toBeUndefined()
  expect(JSON.stringify(body)).not.toContain('raw-patient-id')
  expect(JSON.stringify(body)).not.toContain('陳小華')
  expect(JSON.stringify(body)).not.toContain('1968-05-09')
  expect(cdssGatewayStatus().pending_events).toBe(0)
})

test('failed or unconfirmed save keeps pending actions for retry', async () => {
  recordCdssEvent(input.patient.id, input.packId, { kind: 'interaction', action: 'page_reset' })
  jest.mocked(fetch).mockResolvedValueOnce({ status: 202, json: async () => ({ status: 'queued' }) } as Response)
  await expect(saveCdssSnapshot(input)).rejects.toThrow('cdss_gateway_rejected')
  expect(cdssGatewayStatus().pending_events).toBe(1)
  await saveCdssSnapshot(input)
  const firstId = JSON.parse(jest.mocked(fetch).mock.calls[0][1]?.body as string).save_id
  const retryId = JSON.parse(jest.mocked(fetch).mock.calls[1][1]?.body as string).save_id
  expect(retryId).toBe(firstId)
  expect(cdssGatewayStatus().pending_events).toBe(0)
})

test.each(['/', '/app/?site=hmc', '/app/?site=VGHTPE', '/app/?site=vghtpe&site=vghtpe'])('refuses save on %s', async (url) => {
  window.history.replaceState({}, '', url)
  await expect(saveCdssSnapshot(input)).rejects.toThrow('cdss_site_unavailable')
  expect(fetch).not.toHaveBeenCalled()
})

test('rechecks site after authentication and refuses unsafe origin', async () => {
  let resolveToken: (value: string) => void = () => {}
  mockGetToken.mockReturnValueOnce(new Promise<string>((resolve) => { resolveToken = resolve }))
  const save = saveCdssSnapshot(input)
  await Promise.resolve()
  window.history.replaceState({}, '', '/app/?site=hmc')
  resolveToken('late-token')
  await expect(save).rejects.toThrow('cdss_site_changed')
  expect(fetch).not.toHaveBeenCalled()

  process.env.NEXT_PUBLIC_COLLECTOR_ORIGIN = 'http://remote.example:8787'
  window.history.replaceState({}, '', '/app/?site=vghtpe')
  await expect(saveCdssSnapshot(input)).rejects.toThrow('cdss_endpoint_unavailable')
  expect(fetch).not.toHaveBeenCalled()
})

test('patient key stays stable when the imported FHIR Patient.id changes', async () => {
  await saveCdssSnapshot(input)
  await saveCdssSnapshot({ ...input, patient: { ...input.patient, id: 'new-import-id' } })
  const bodies = jest.mocked(fetch).mock.calls.map((call) => JSON.parse(call[1]?.body as string))
  expect(bodies[0].patient_key_sha256).toBe(bodies[1].patient_key_sha256)
  expect(bodies[0].patient_session_id).not.toBe(bodies[1].patient_session_id)
})

test('does not transmit when complete identity inputs are missing', async () => {
  await expect(saveCdssSnapshot({ ...input, patient: { ...input.patient, birthDate: '1968' } }))
    .rejects.toThrow('cdss_identity_unavailable')
  await expect(saveCdssSnapshot({ ...input, patient: { ...input.patient, identifier: [] } }))
    .rejects.toThrow('cdss_identity_unavailable')
  await expect(saveCdssSnapshot({ ...input, patient: { ...input.patient,
    identifier: [{ system: 'https://example.org/national-id', value: 'X123456789' }],
  } })).rejects.toThrow('cdss_identity_unavailable')
  expect(fetch).not.toHaveBeenCalled()
})
