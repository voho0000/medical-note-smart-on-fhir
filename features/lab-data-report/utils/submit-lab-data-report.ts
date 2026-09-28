// Sends a lab-data report to the `submitLabDataReport` Function. Uses the
// same header set as the feedback Function (Firebase ID token + App Check +
// Content-Type), all of which the Functions CORS allowlist already carries —
// this feature adds no request header.
import { getFeedbackRequestHeaders } from '@/src/application/feedback/feedback-request-headers'
import type { LabDataReportPayload, LabDataReportResponse } from '../types'

// The Function's own timeout (60 s). Giving up earlier told a clinician
// "failed" for a report that was in fact stored — seen on a cold start.
const SUBMIT_TIMEOUT_MS = 60_000

/**
 * SHA-256 of the exact payload. The Function stores one report per key and
 * uid, so pressing 送出 again after a timeout returns the first report id
 * instead of storing a duplicate. Changed content → a new key → a new report.
 */
export async function labDataReportSubmissionKey(body: string): Promise<string | undefined> {
  try {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  } catch {
    return undefined // No SubtleCrypto (insecure context): send without a key.
  }
}

/**
 * The Function's URL. An explicit NEXT_PUBLIC_LAB_DATA_REPORT_URL wins;
 * otherwise it is derived from the feedback Function's URL, which every build
 * already receives: v2 Functions in one project and region share a host
 * suffix and differ only in the lower-cased function name, and the dev-*
 * group keeps its prefix (dev-sendfeedback-… → dev-submitlabdatareport-…).
 */
export function resolveLabDataReportUrl(
  env: { explicit?: string; feedback?: string } = {
    explicit: process.env.NEXT_PUBLIC_LAB_DATA_REPORT_URL,
    feedback: process.env.NEXT_PUBLIC_FEEDBACK_URL,
  },
): string | null {
  const explicit = env.explicit?.trim()
  if (explicit) return explicit
  const feedback = env.feedback?.trim()
  if (!feedback) return null
  try {
    const url = new URL(feedback)
    // Cloud Run style: https://[dev-]sendfeedback-<hash>-<region>.a.run.app
    const runHost = url.hostname.match(/^(dev-)?sendfeedback-(.+\.run\.app)$/)
    if (runHost) {
      url.hostname = `${runHost[1] ?? ''}submitlabdatareport-${runHost[2]}`
      return url.toString().replace(/\/$/, '')
    }
    // cloudfunctions.net / emulator style: …/[dev-]sendFeedback
    const path = url.pathname.match(/^(.*\/)(dev-)?sendFeedback\/?$/)
    if (path) {
      url.pathname = `${path[1]}${path[2] ?? ''}submitLabDataReport`
      return url.toString()
    }
  } catch {
    // Not a URL (e.g. the relative /api/feedback dev fallback).
  }
  return null
}

export type LabDataReportSubmitResult =
  | { ok: true; reportId: string }
  | { ok: false; status: number | 'timeout' | 'network' | 'unconfigured'; reason?: string }

export async function submitLabDataReport(
  payload: LabDataReportPayload,
  { signal, url = resolveLabDataReportUrl() }: { signal?: AbortSignal; url?: string | null } = {},
): Promise<LabDataReportSubmitResult> {
  if (!url) return { ok: false, status: 'unconfigured' }

  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort)
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, SUBMIT_TIMEOUT_MS)

  try {
    const report = JSON.stringify(payload)
    const [headers, submissionKey] = await Promise.all([
      getFeedbackRequestHeaders(),
      labDataReportSubmissionKey(report),
    ])
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: submissionKey ? JSON.stringify({ ...payload, submissionKey }) : report,
      signal: controller.signal,
    })
    const result = await response.json().catch(() => ({})) as LabDataReportResponse
    if (!response.ok || result.success !== true || !result.reportId) {
      return { ok: false, status: response.status, reason: result.reason }
    }
    return { ok: true, reportId: result.reportId }
  } catch {
    return { ok: false, status: timedOut ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}
