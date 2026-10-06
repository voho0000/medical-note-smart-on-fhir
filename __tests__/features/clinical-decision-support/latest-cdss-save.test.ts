jest.mock('@/features/clinical-decision-support/telemetry/cdss-history', () => ({ listCdssHistory: jest.fn(), readCdssHistory: jest.fn() }))
import { latestCdssSave } from '@/features/clinical-decision-support/telemetry/latest-cdss-save'
import { listCdssHistory, readCdssHistory, type CdssHistoryRecord, type CdssHistoryList } from '@/features/clinical-decision-support/telemetry/cdss-history'
const patient = { id: 'synthetic', resourceType: 'Patient' as const }
const signal = new AbortController().signal
const entry = (saveId: string, packId: string, receivedAt: string) => ({ saveId, packId, receivedAt, documentId: 'doc', patientId: 'patient', versionId: '1' })
beforeEach(() => jest.resetAllMocks())
test('chooses newest receipt across all packs and forwards the current owner and patient', async () => {
  const records = [entry('old', 'hf', '2026-01-01T00:00:00Z'), entry('other', 'af', '2026-03-01T00:00:00Z'), entry('latest', 'hf', '2026-02-01T00:00:00Z')]
  jest.mocked(listCdssHistory).mockResolvedValue({ records, hasMore: false } as CdssHistoryList)
  jest.mocked(readCdssHistory).mockResolvedValue({ packId: 'af' } as CdssHistoryRecord)
  await latestCdssSave(patient, signal, 'owner-a')
  expect(listCdssHistory).toHaveBeenCalledWith(patient, signal, 'owner-a')
  expect(readCdssHistory).toHaveBeenCalledWith(patient, 'other', signal, 'owner-a')
})
test('empty complete history means no saved baseline', async () => {
  jest.mocked(listCdssHistory).mockResolvedValue({ records: [], hasMore: false })
  await expect(latestCdssSave(patient, signal, 'owner-a')).resolves.toBeNull()
  expect(readCdssHistory).not.toHaveBeenCalled()
})
test('a truncated list cannot prove that the patient has no saved record', async () => {
  jest.mocked(listCdssHistory).mockResolvedValue({ records: [], hasMore: true })
  await expect(latestCdssSave(patient, signal, 'owner-a')).rejects.toThrow('cdss_history_incomplete')
})
test('failed lookup never reads a stale cached snapshot', async () => {
  jest.mocked(listCdssHistory).mockRejectedValue(new Error('offline'))
  await expect(latestCdssSave(patient, signal, 'owner-a')).rejects.toThrow('offline')
  expect(readCdssHistory).not.toHaveBeenCalled()
})
