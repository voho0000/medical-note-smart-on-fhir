import { toast } from 'sonner'
import { sendLabDataReportInBackground, withRawRows } from '@/features/lab-data-report/utils/send-in-background'
import { submitLabDataReport } from '@/features/lab-data-report/utils/submit-lab-data-report'
import { extractRawLabRows } from '@/features/lab-data-report/utils/raw-lab-rows'

jest.mock('sonner', () => ({
  toast: { loading: jest.fn(() => 't1'), success: jest.fn(), error: jest.fn() },
}))
jest.mock('@/features/lab-data-report/utils/submit-lab-data-report', () => ({
  submitLabDataReport: jest.fn(),
}))

const strings = {
  sending: 'sending', readingRaw: 'reading', successTitle: 'done', successId: 'id', copyId: 'copy', retry: 'retry',
  failure: () => 'failed',
}
const base: any = { schemaVersion: 1, rows: [{ ref: 1 }], rawSource: { stale: true }, rawSourceError: 'EXPIRED' }
const extract = extractRawLabRows(JSON.stringify({ endpoints: { '/imu/api/imue0060/imue0060s02/get-data': { status: 200, body: JSON.stringify({ robject: [{ r: 1, order_code: '08003C', assay_item_name: 'Hb', assay_value: '11', case_time: '2026-03-02T09:30:00+08:00' }] }) } } }))!

describe('withRawRows', () => {
  it('replaces whatever raw state the base carried', () => {
    const withRows = withRawRows(base, { ok: true, extract, expiresAt: 0, producerVersion: '0.12.19' }, { dayZero: null, includeValues: true })
    expect(withRows.rawSource?.rows).toHaveLength(1)
    expect(withRows.rawSourceError).toBeUndefined()
    expect(withRawRows(base, { ok: false, code: 'NOT_AVAILABLE' }, { dayZero: null, includeValues: true })).toEqual(expect.objectContaining({ rawSourceError: 'NOT_AVAILABLE' }))
    const aborted = withRawRows(base, { ok: false, code: 'ABORTED' }, { dayZero: null, includeValues: true })
    expect(aborted.rawSource).toBeUndefined()
    expect(aborted.rawSourceError).toBeUndefined()
  })
})

describe('sendLabDataReportInBackground', () => {
  beforeEach(() => jest.clearAllMocks())

  it('waits for a pending raw read, then sends and reports the id', async () => {
    ;(submitLabDataReport as jest.Mock).mockResolvedValue({ ok: true, reportId: 'LDR-1' })
    const result = await sendLabDataReportInBackground({
      base,
      raw: { read: Promise.resolve({ ok: true, extract, expiresAt: 0 }), dayZero: null, includeValues: true },
    }, strings)
    expect(result).toEqual({ ok: true, reportId: 'LDR-1' })
    expect(toast.loading).toHaveBeenNthCalledWith(1, 'reading')
    expect(toast.loading).toHaveBeenNthCalledWith(2, 'sending', { id: 't1' })
    expect((submitLabDataReport as jest.Mock).mock.calls[0][0].rawSource.rows).toHaveLength(1)
    expect(toast.success).toHaveBeenCalledWith('done', expect.objectContaining({ id: 't1', description: 'id LDR-1' }))
  })

  it('keeps a failure on screen with a retry of the same payload', async () => {
    ;(submitLabDataReport as jest.Mock).mockResolvedValueOnce({ ok: false, status: 'network' }).mockResolvedValueOnce({ ok: true, reportId: 'LDR-2' })
    await sendLabDataReportInBackground({ base }, strings)
    const [message, options] = (toast.error as jest.Mock).mock.calls[0]
    expect(message).toBe('failed')
    expect(options.duration).toBe(Number.POSITIVE_INFINITY)
    await options.action.onClick()
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(submitLabDataReport).toHaveBeenCalledTimes(2)
    expect((submitLabDataReport as jest.Mock).mock.calls[1][0]).toBe((submitLabDataReport as jest.Mock).mock.calls[0][0])
    expect(toast.success).toHaveBeenCalledWith('done', expect.objectContaining({ description: 'id LDR-2' }))
  })
})
