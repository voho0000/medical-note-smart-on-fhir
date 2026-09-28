/**
 * @jest-environment node
 */
// Node environment: WebCrypto's subtle.digest is what browsers use here.
import {
  labDataReportSubmissionKey,
  resolveLabDataReportUrl,
} from '@/features/lab-data-report/utils/submit-lab-data-report'

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
