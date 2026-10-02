/**
 * @jest-environment node
 */
// Node environment: WebCrypto's subtle.digest is what browsers use here.
import {
  labDataReportSubmissionKey,
  resolveInstitutionReportUrl,
  resolveLabDataReportUrl,
  submitLabDataReport,
  testLabDataReportConnection,
} from '@/features/lab-data-report/utils/submit-lab-data-report'

jest.mock('@/src/application/feedback/feedback-request-headers', () => ({
  getFeedbackRequestHeaders: jest.fn(() => Promise.resolve({
    'Content-Type': 'application/json',
    'x-proxy-key': 'proxy-key',
    Authorization: 'Bearer id-token',
    'X-Firebase-AppCheck': 'app-check',
  })),
  getIdTokenRequestHeaders: jest.fn(() => Promise.resolve({
    'Content-Type': 'application/json',
    Authorization: 'Bearer id-token',
  })),
}))

describe('labDataReportSubmissionKey', () => {
  it('fingerprints the exact payload, so a resend carries the same key', async () => {
    const first = await labDataReportSubmissionKey('{"rows":[1]}')
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(await labDataReportSubmissionKey('{"rows":[1]}')).toBe(first)
    expect(await labDataReportSubmissionKey('{"rows":[2]}')).not.toBe(first)
  })
})

describe('resolveLabDataReportUrl', () => {
  it('prefers the explicit URL', () => {
    expect(resolveLabDataReportUrl({
      explicit: 'http://127.0.0.1:5017/demo-mediprisma/us-central1/dev-submitLabDataReport',
      feedback: 'https://sendfeedback-abc123-uc.a.run.app',
    })).toBe('http://127.0.0.1:5017/demo-mediprisma/us-central1/dev-submitLabDataReport')
  })

  it('derives the Cloud Run URL from the feedback Function, keeping the dev- prefix', () => {
    expect(resolveLabDataReportUrl({ feedback: 'https://sendfeedback-abc123-uc.a.run.app' }))
      .toBe('https://submitlabdatareport-abc123-uc.a.run.app')
    expect(resolveLabDataReportUrl({ feedback: 'https://dev-sendfeedback-abc123-uc.a.run.app/' }))
      .toBe('https://dev-submitlabdatareport-abc123-uc.a.run.app')
  })

  it('derives cloudfunctions.net and emulator paths', () => {
    expect(resolveLabDataReportUrl({ feedback: 'https://us-central1-proj.cloudfunctions.net/sendFeedback' }))
      .toBe('https://us-central1-proj.cloudfunctions.net/submitLabDataReport')
    expect(resolveLabDataReportUrl({ feedback: 'http://127.0.0.1:5001/proj/us-central1/dev-sendFeedback' }))
      .toBe('http://127.0.0.1:5001/proj/us-central1/dev-submitLabDataReport')
  })

  it('returns null rather than guessing', () => {
    expect(resolveLabDataReportUrl({})).toBeNull()
    expect(resolveLabDataReportUrl({ feedback: '/api/feedback' })).toBeNull()
    expect(resolveLabDataReportUrl({ feedback: 'https://example.com/other' })).toBeNull()
  })
})

describe('resolveInstitutionReportUrl', () => {
  it('is off until a build names the Gateway', () => {
    expect(resolveInstitutionReportUrl(undefined)).toBeNull()
    expect(resolveInstitutionReportUrl('  ')).toBeNull()
  })

  it('takes an HTTPS endpoint, or plain HTTP on loopback only', () => {
    expect(resolveInstitutionReportUrl('https://gateway.example.test:8787/lab-reports/v1/reports'))
      .toBe('https://gateway.example.test:8787/lab-reports/v1/reports')
    expect(resolveInstitutionReportUrl('http://127.0.0.1:8787/lab-reports/v1/reports'))
      .toBe('http://127.0.0.1:8787/lab-reports/v1/reports')
    expect(resolveInstitutionReportUrl('http://gateway.example.test/lab-reports')).toBeNull()
  })

  it('refuses credentials, a query, a fragment or no URL at all', () => {
    expect(resolveInstitutionReportUrl('https://user:secret@gateway.example.test/r')).toBeNull()
    expect(resolveInstitutionReportUrl('https://gateway.example.test/r?token=x')).toBeNull()
    expect(resolveInstitutionReportUrl('https://gateway.example.test/r#x')).toBeNull()
    expect(resolveInstitutionReportUrl('gateway')).toBeNull()
  })
})

describe('sending to a destination', () => {
  const payload: any = { schemaVersion: 1, rows: [{ ref: 1 }] }
  let fetchMock: jest.SpyInstance

  const respond = (status: number, body: unknown) =>
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch')
  })
  afterEach(() => fetchMock.mockRestore())

  it('sends the team the feedback headers, and the Gateway only the ID token, without cookies or referrer', async () => {
    respond(200, { success: true, reportId: 'LDR-1' })
    expect(await submitLabDataReport(payload, { url: 'https://team.example.test/submitLabDataReport' }))
      .toEqual({ ok: true, reportId: 'LDR-1' })
    const [, team] = fetchMock.mock.calls[0]
    expect(team.headers).toEqual(expect.objectContaining({ 'X-Firebase-AppCheck': 'app-check', 'x-proxy-key': 'proxy-key' }))
    expect(team.credentials).toBeUndefined()

    respond(201, { success: true, reportId: 'GW-1' })
    expect(await submitLabDataReport(payload, { destination: 'institution', url: 'https://gateway.example.test/r' }))
      .toEqual({ ok: true, reportId: 'GW-1' })
    const [url, institution] = fetchMock.mock.calls[1]
    expect(url).toBe('https://gateway.example.test/r')
    expect(institution.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer id-token' })
    expect(institution).toEqual(expect.objectContaining({
      credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store',
    }))
    // Same body, same submission key: a resend is recognised by either side.
    expect(JSON.parse(institution.body)).toEqual(JSON.parse(team.body))
    expect(JSON.parse(institution.body).submissionKey).toMatch(/^[0-9a-f]{64}$/)
  })

  it('never contacts an institution with no Gateway set up', async () => {
    expect(await submitLabDataReport(payload, { destination: 'institution', url: null }))
      .toEqual({ ok: false, status: 'unconfigured' })
    expect(await testLabDataReportConnection('institution', { url: null }))
      .toEqual({ ok: false, status: 'unconfigured' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('tests a connection with the flag alone, and needs the answer to say so', async () => {
    respond(200, { success: true, connectionTest: true })
    expect(await testLabDataReportConnection('team', { url: 'https://team.example.test/submitLabDataReport' }))
      .toEqual({ ok: true })
    expect(fetchMock.mock.calls[0][1].body).toBe('{"connectionTest":true}')

    // A Function from before the test mode reads the flag as a bad report.
    respond(400, { success: false, error: 'Invalid report', reason: 'schemaVersion: unsupported' })
    expect(await testLabDataReportConnection('team', { url: 'https://team.example.test/submitLabDataReport' }))
      .toEqual({ ok: false, status: 400, reason: 'schemaVersion: unsupported' })

    respond(200, { success: true, reportId: 'LDR-1' })
    expect(await testLabDataReportConnection('institution', { url: 'https://gateway.example.test/r' }))
      .toEqual({ ok: false, status: 200, reason: undefined })
  })

  it('reports an unreachable destination as a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await testLabDataReportConnection('institution', { url: 'https://gateway.example.test/r' }))
      .toEqual({ ok: false, status: 'network' })
  })
})
