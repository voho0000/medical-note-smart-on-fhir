jest.mock('@/features/clinical-decision-support/telemetry/cdss-history', () => ({ listCdssHistory: jest.fn(), readCdssHistory: jest.fn() }))
jest.mock('@/src/application/providers/auth.provider', () => ({ useAuth: () => mockAccount }))
jest.mock('@/features/clinical-decision-support/telemetry/fhir-auth', () => ({
  fhirOAuthEnabled: () => mockOAuth, fhirAuthStatus: () => mockAuthorized, subscribeFhirAuth: () => () => {}, disconnectFhir: jest.fn(),
}))
jest.mock('@/features/clinical-decision-support/telemetry/cdss-gateway', () => ({
  cdssGatewayStatus: () => ({ enabled: true }), saveCdssSnapshot: jest.fn(), cancelCdssGatewayRequests: jest.fn(),
}))
jest.mock('@/features/clinical-decision-support/telemetry/latest-cdss-save', () => ({ latestCdssSave: jest.fn() }))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CdssStorageActions } from '@/features/clinical-decision-support/renderers/CdssStorageActions'
import { listCdssHistory } from '@/features/clinical-decision-support/telemetry/cdss-history'
import { latestCdssSave } from '@/features/clinical-decision-support/telemetry/latest-cdss-save'
import { disconnectFhir } from '@/features/clinical-decision-support/telemetry/fhir-auth'
import { useHfpefInputsStore } from '@/features/clinical-decision-support/stores/hfpef-inputs.store'
import { useAfAnswersStore } from '@/features/clinical-decision-support/stores/af-answers.store'
import { usePhenotypeAnswerStore, setPhenotypeAnswerRepository, createEncryptedPhenotypeAnswerRepository } from '@/features/clinical-decision-support/stores/phenotype-answer.store'
import { usePhysicianDecisionsStore } from '@/features/clinical-decision-support/stores/physician-decisions.store'
import { saveCdssSnapshot } from '@/features/clinical-decision-support/telemetry/cdss-gateway'
import { useNhiLipidReviewStore } from '@/features/clinical-decision-support/stores/nhi-lipid-review.store'
import { useClinicVitalsStore } from '@/features/clinical-decision-support/stores/clinic-vitals.store'
import { useEvidenceOverridesStore } from '@/features/clinical-decision-support/stores/evidence-overrides.store'
import { useVisitAnswersStore } from '@/features/clinical-decision-support/stores/visit-answers.store'
import { restoreSavedAssessment, savedAssessmentFingerprint, assessmentFingerprint } from '@/features/clinical-decision-support/stores/saved-assessment'
import { patientAnswerBacking } from '@/features/clinical-decision-support/stores/patient-answer-backing'
import type { CdssHistoryRecord } from '@/features/clinical-decision-support/telemetry/cdss-history'
const mockAccount: { user: { uid: string } | null } = { user: { uid: 'owner-a' } }
let mockOAuth = false
let mockAuthorized = true
const inputs = { evidenceOverrides: { row: false } }
const saved = { packId: 'synthetic', savedAt: '2026-10-06T00:00:00Z', save: { physician_inputs: inputs, physician_decisions: {} } } as unknown as CdssHistoryRecord
const input = { patient: { id: 'synthetic', resourceType: 'Patient', name: [{ text: '合成病人' }] }, packId: 'synthetic', profile: {}, result: {}, physicianInputs: inputs, physicianDecisions: {} } as unknown as Parameters<typeof CdssStorageActions>[0]['input']
const mount = (patch = {}) => render(<CdssStorageActions input={{ ...input, ...patch }} sourceRecords={() => []} />)
beforeEach(() => {
  jest.clearAllMocks()
  mockOAuth = false
  mockAuthorized = true
  mockAccount.user = { uid: 'owner-a' }
  jest.mocked(latestCdssSave).mockResolvedValue(saved)
  jest.mocked(saveCdssSnapshot).mockResolvedValue(undefined)
})
test('reentry compares the persisted draft with saved answers, without applying history', async () => {
  useEvidenceOverridesStore.getState().setOverride('synthetic', 'row', true)
  const view = mount({ physicianInputs: { evidenceOverrides: { row: true } } })
  await screen.findByText('有未儲存變更')
  expect(useEvidenceOverridesStore.getState().byPatientId.synthetic.row).toBe(true)
  await act(async () => { view.rerender(<CdssStorageActions input={input} sourceRecords={() => []} />) })
  expect(screen.getByText('與最後儲存狀態一致')).toBeInTheDocument()
})
test('failed save keeps dirty status; successful save tracks click-time answers, not later edits', async () => {
  const changed = { ...input, physicianInputs: { evidenceOverrides: { row: true } } }
  const view = mount(changed)
  await screen.findByText('有未儲存變更')
  jest.mocked(saveCdssSnapshot).mockRejectedValueOnce(new Error('offline'))
  fireEvent.click(screen.getByTestId('cdss-save-record'))
  await waitFor(() => expect(screen.getByTestId('cdss-save-record')).toBeEnabled())
  expect(screen.getByText('有未儲存變更')).toBeInTheDocument()
  let resolve!: () => void
  jest.mocked(saveCdssSnapshot).mockImplementationOnce(() => new Promise<void>(r => { resolve = r }))
  fireEvent.click(screen.getByTestId('cdss-save-record'))
  await act(async () => { view.rerender(<CdssStorageActions input={{ ...input, physicianInputs: { evidenceOverrides: { row: false } } }} sourceRecords={() => []} />) })
  await act(async () => resolve())
  expect(screen.getByText('有未儲存變更')).toBeInTheDocument()
})
test('restore requires confirmation; cancel preserves draft and confirmation replaces it including removed fields', async () => {
  useEvidenceOverridesStore.getState().setOverride('synthetic', 'extra', true)
  mount({ physicianInputs: { evidenceOverrides: { row: true, extra: true } } })
  await screen.findByText('有未儲存變更')
  fireEvent.click(screen.getByTestId('cdss-restore-record'))
  await screen.findByRole('button', { name: '確認還原' })
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(useEvidenceOverridesStore.getState().byPatientId.synthetic.extra).toBe(true)
  fireEvent.click(screen.getByTestId('cdss-restore-record'))
  fireEvent.click(await screen.findByRole('button', { name: '確認還原' }))
  expect(useEvidenceOverridesStore.getState().byPatientId.synthetic).toEqual({ row: false })
})
test('failed lookup and owner change cannot apply an in-flight restore', async () => {
  const view = mount()
  await screen.findByText('與最後儲存狀態一致')
  jest.mocked(latestCdssSave).mockRejectedValueOnce(new Error('offline'))
  fireEvent.click(screen.getByTestId('cdss-restore-record'))
  await waitFor(() => expect(screen.getByTestId('cdss-restore-record')).toBeEnabled())
  expect(screen.queryByRole('button', { name: '確認還原' })).not.toBeInTheDocument()
  let resolve!: (value: CdssHistoryRecord) => void
  jest.mocked(latestCdssSave).mockImplementationOnce(() => new Promise(r => { resolve = r }))
  fireEvent.click(screen.getByTestId('cdss-restore-record'))
  mockAccount.user = null
  await act(async () => { view.rerender(<CdssStorageActions input={input} sourceRecords={() => []} />) })
  await act(async () => resolve(saved))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
test('restoration preserves examination dates, updates sealed draft backing and does not revive yesterday visit answers', async () => {
  const old = { ...saved, savedAt: '2020-01-01T00:00:00Z', save: { ...saved.save, physician_inputs: {
    clinicVitals: { entries: { bodyWeight: { value: 65, measuredOn: '2020-01-01', modifiedAt: '2020-01-01T00:00:00Z' } } },
    evidenceOverrides: { row: false }, visitAnswers: { 'dyspnoea-trend': 'worse' },
  } } } as unknown as CdssHistoryRecord
  const persist = jest.spyOn(patientAnswerBacking(), 'save')
  restoreSavedAssessment('synthetic', old)
  expect(useClinicVitalsStore.getState().byPatientId.synthetic.entries.bodyWeight?.measuredOn).toBe('2020-01-01')
  expect(useVisitAnswersStore.getState().byPatientId.synthetic).toEqual({})
  expect(persist).toHaveBeenCalledWith('evidence-overrides', 'synthetic', { row: false })
  expect(savedAssessmentFingerprint(old)).toBe(assessmentFingerprint({ ...old.save.physician_inputs, visitAnswers: {} }, {}))
  persist.mockRestore()
})

test('switching care packs neither disconnects FHIR nor cancels an explicit save', async () => {
  const view = mount()
  await screen.findByText('與最後儲存狀態一致')
  let resolve!: () => void
  jest.mocked(saveCdssSnapshot).mockImplementationOnce(() => new Promise<void>(r => { resolve = r }))
  fireEvent.click(screen.getByTestId('cdss-save-record'))
  await act(async () => { view.rerender(<CdssStorageActions input={{ ...input, packId: 'another-pack' }} sourceRecords={() => []} />) })
  expect(disconnectFhir).not.toHaveBeenCalled()
  await act(async () => resolve())
  expect(screen.getByText('與最後儲存狀態一致')).toBeInTheDocument()
})
test('failed save during the initial read retries the saved baseline and identifies the unsaved draft', async () => {
  jest.mocked(latestCdssSave).mockImplementationOnce(() => new Promise(() => {}))
  mount({ physicianInputs: { evidenceOverrides: { row: true } } })
  await screen.findByText('確認儲存狀態中…')
  jest.mocked(saveCdssSnapshot).mockRejectedValueOnce(new Error('offline'))
  fireEvent.click(screen.getByTestId('cdss-save-record'))
  await screen.findByText('有未儲存變更')
  expect(latestCdssSave).toHaveBeenCalledTimes(2)
})
test('full snapshot restores all sealed stores; cache errors cannot leave a partly restored assessment', () => {
  const repository = { load: jest.fn(async () => undefined), save: jest.fn(async () => {}), clear: jest.fn(async () => {}) }
  setPhenotypeAnswerRepository(repository)
  const persist = jest.spyOn(patientAnswerBacking(), 'save').mockImplementation(() => { throw new Error('quota') })
  const restored = { ...saved, save: { ...saved.save,
    physician_inputs: { clinicVitals: { entries: { bodyWeight: { value: 65, measuredOn: '2020-01-01' } } },
      hfpefInputs: { entries: { E_e: { value: '10', measuredOn: '2020-01-01' } } },
      phenotypeAnswer: { choice: 'reduced', lvef: 35, measuredOn: '2020-01-01', answeredOn: '2020-01-01', modifiedAt: {} },
      afAnswers: { aflConfirmed: false }, evidenceOverrides: { row: false } },
    physician_decisions: { module: { decision: 'reviewed', reasons: ['synthetic'], recordedAt: '2020-01-01T00:00:00Z', packVersion: '1' } },
  } } as CdssHistoryRecord
  expect(() => restoreSavedAssessment('synthetic', restored)).not.toThrow()
  expect(useAfAnswersStore.getState().answers).toEqual({ aflConfirmed: false })
  expect(useHfpefInputsStore.getState().byPatientId.synthetic.entries.E_e.value).toBe('10')
  expect(usePhenotypeAnswerStore.getState().byPatientId.synthetic.answeredOn).toBe('2020-01-01')
  expect(usePhysicianDecisionsStore.getState().byPatientId.synthetic.module.decision).toBe('reviewed')
  for (const kind of ['clinic-vitals', 'hfpef-inputs', 'af-answers', 'evidence-overrides', 'physician-decisions']) {
    expect(persist).toHaveBeenCalledWith(kind, 'synthetic', expect.any(Object))
  }
  expect(repository.save).toHaveBeenCalledWith('synthetic', expect.objectContaining({ measuredOn: '2020-01-01' }))
  persist.mockRestore()
  setPhenotypeAnswerRepository(createEncryptedPhenotypeAnswerRepository())
})
test('legacy save near Taiwan midnight and normalized legacy fields match the restored assessment', () => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 6, 1, 0))
  try {
    const record = { ...saved, savedAt: '2026-10-05T17:00:00Z', save: { ...saved.save, physician_inputs: {
      visitAnswers: { 'dyspnoea-trend': 'worse' }, hfpefInputs: { entries: { E_e: { value: '10' } } },
    } } } as CdssHistoryRecord
    restoreSavedAssessment('synthetic', record)
    expect(useVisitAnswersStore.getState().byPatientId.synthetic['dyspnoea-trend']?.value).toBe('worse')
    expect(savedAssessmentFingerprint(record)).toBe(assessmentFingerprint({ visitAnswers: { 'dyspnoea-trend': 'worse' },
      hfpefInputs: useHfpefInputsStore.getState().byPatientId.synthetic }, {}))
  } finally { jest.useRealTimers() }
})

test('saved-state prompt and restore move together with the save button into full window', async () => {
  const target = document.createElement('div')
  document.body.append(target)
  try {
    const view = mount({ physicianInputs: { evidenceOverrides: { row: true } } })
    await screen.findByText('有未儲存變更')
  await act(async () => { view.rerender(<CdssStorageActions input={{ ...input, physicianInputs: { evidenceOverrides: { row: true } } }} saveTarget={target} sourceRecords={() => []} />) })
    for (const id of ['cdss-save-record', 'cdss-save-status', 'cdss-restore-record']) {
      expect(target).toContainElement(screen.getByTestId(id))
    }
  } finally { target.remove() }
})
test('restored AI evidence remains subject to source invalidation; manual answers survive', () => {
  const record = { ...saved, save: { ...saved.save, physician_inputs: {
    nhiLipidReview: { aiRow: 'yes', manualRow: 'no' }, nhiLipidReviewProvenance: {
      aiRow: { source: 'ai', runId: 'old-run', inputSignature: 'old-input', sourceScopeSignature: 'old-sources' },
      manualRow: { source: 'manual' },
    },
  } } } as CdssHistoryRecord
  restoreSavedAssessment('synthetic', record)
  useNhiLipidReviewStore.getState().invalidateAiReview('synthetic', 'new-input', 'new-sources')
  expect(useNhiLipidReviewStore.getState().answers).toEqual({ manualRow: 'no' })
})

test('owner switch while confirmation is open cannot apply the previous owner snapshot', async () => {
  const view = mount()
  await screen.findByText('與最後儲存狀態一致')
  fireEvent.click(screen.getByTestId('cdss-restore-record'))
  await screen.findByRole('button', { name: '確認還原' })
  mockAccount.user = { uid: 'owner-b' }
  await act(async () => { view.rerender(<CdssStorageActions input={input} sourceRecords={() => []} />) })
  expect(screen.queryByRole('button', { name: '確認還原' })).not.toBeInTheDocument()
})
test('equivalent patient object during an edit does not restart lookup or overwrite the click-time save baseline', async () => {
  const view = mount()
  await screen.findByText('與最後儲存狀態一致')
  await act(async () => { view.rerender(<CdssStorageActions input={{ ...input, patient: { ...input.patient }, physicianInputs: { evidenceOverrides: { row: true } } }} sourceRecords={() => []} />) })
  expect(screen.getByText('有未儲存變更')).toBeInTheDocument()
  expect(latestCdssSave).toHaveBeenCalledTimes(1)
})

test('expired OAuth closes a ready confirmation and does not reopen it after authorizing again', async () => {
  mockOAuth = true
  const view = mount()
  await screen.findByText('與最後儲存狀態一致')
  fireEvent.click(screen.getByTestId('cdss-restore-record'))
  await screen.findByRole('button', { name: '確認還原' })
  mockAuthorized = false
  await act(async () => { view.rerender(<CdssStorageActions input={input} sourceRecords={() => []} />) })
  expect(screen.queryByRole('button', { name: '確認還原' })).not.toBeInTheDocument()
  expect(screen.getByTestId('cdss-restore-record')).toBeDisabled()
  expect(screen.queryByText('確認儲存狀態中…')).not.toBeInTheDocument()
  mockAuthorized = true
  await act(async () => { view.rerender(<CdssStorageActions input={input} sourceRecords={() => []} />) })
  await screen.findByText('與最後儲存狀態一致')
  expect(screen.queryByRole('button', { name: '確認還原' })).not.toBeInTheDocument()
})
test('a failed pending save does not abort an independent history lookup', async () => {
  mount()
  await screen.findByText('與最後儲存狀態一致')
  let rejectSave!: (failure: Error) => void
  jest.mocked(saveCdssSnapshot).mockImplementationOnce(() => new Promise((_, reject) => { rejectSave = reject }))
  let resolveHistory!: (value: { records: []; hasMore: boolean }) => void
  let historySignal!: AbortSignal
  jest.mocked(listCdssHistory).mockImplementationOnce((_patient, signal) => {
    historySignal = signal
    return new Promise(resolve => { resolveHistory = resolve })
  })
  fireEvent.click(screen.getByTestId('cdss-save-record'))
  fireEvent.click(screen.getByTestId('cdss-history-records'))
  await screen.findByText('載入中…')
  await act(async () => rejectSave(new Error('offline')))
  expect(historySignal.aborted).toBe(false)
  await act(async () => resolveHistory({ records: [], hasMore: false }))
  expect(await screen.findByText('尚無儲存紀錄。')).toBeInTheDocument()
})
