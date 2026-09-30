// Sends a lab-data report after the dialog has closed. A clinic cannot wait
// on a spinner: once the clinician presses 確定送出 the dialog goes away, the
// (optional) raw-row read and the upload finish here, and the outcome comes
// back as a toast — the report id to copy, or the reason with 重試.
//
// This is the only toast the feature ever shows, and only as the answer to a
// report the clinician chose to send, so the question-free MediCloud launch
// route stays free of prompts.
import { toast } from 'sonner'
import type { LabDataReportPayload } from '../types'
import { assembleRawLabSource } from './raw-lab-rows'
import type { RawLabRead } from './read-raw-lab-rows'
import { submitLabDataReport, type LabDataReportSubmitResult } from './submit-lab-data-report'

export interface BackgroundRawRows {
  /** The raw capture: already read, or still being read. */
  read: RawLabRead | Promise<RawLabRead>
  /** The report's day 0 and value choice, to place the raw rows. */
  dayZero: number | null
  includeValues: boolean
}

export interface BackgroundReportStrings {
  sending: string
  readingRaw: string
  successTitle: string
  successId: string
  copyId: string
  retry: string
  failure: (result: Exclude<LabDataReportSubmitResult, { ok: true }>) => string
}

/** The report as sent: the rows, plus the raw rows or why they are missing. */
export function withRawRows(base: LabDataReportPayload, read: RawLabRead, raw: Omit<BackgroundRawRows, 'read'>): LabDataReportPayload {
  const { rawSource: _rawSource, rawSourceError: _rawSourceError, ...rest } = base
  if (read.ok) {
    return {
      ...rest,
      rawSource: assembleRawLabSource(read.extract, {
        dayZero: raw.dayZero,
        includeValues: raw.includeValues,
        producerVersion: read.producerVersion,
      }),
    }
  }
  return read.code === 'ABORTED' ? rest : { ...rest, rawSourceError: read.code }
}

export function sendLabDataReportInBackground(
  report: { base: LabDataReportPayload; raw?: BackgroundRawRows },
  strings: BackgroundReportStrings,
): Promise<LabDataReportSubmitResult> {
  const pendingRaw = report.raw && report.raw.read instanceof Promise
  const id = toast.loading(pendingRaw ? strings.readingRaw : strings.sending)

  const submit = async (payload: LabDataReportPayload): Promise<LabDataReportSubmitResult> => {
    toast.loading(strings.sending, { id })
    const result = await submitLabDataReport(payload)
    if (result.ok) {
      toast.success(strings.successTitle, {
        id,
        description: `${strings.successId} ${result.reportId}`,
        duration: 12_000,
        action: {
          label: strings.copyId,
          onClick: () => { void navigator.clipboard?.writeText(result.reportId).catch(() => undefined) },
        },
      })
    } else {
      // A retry sends the same payload; the Function answers a resend with
      // the first report, so a slow success never becomes two reports.
      toast.error(strings.failure(result), {
        id,
        duration: Number.POSITIVE_INFINITY,
        action: { label: strings.retry, onClick: () => { void submit(payload) } },
      })
    }
    return result
  }

  return (async () => {
    let payload = report.base
    if (report.raw) payload = withRawRows(report.base, await report.raw.read, report.raw)
    return submit(payload)
  })()
}
