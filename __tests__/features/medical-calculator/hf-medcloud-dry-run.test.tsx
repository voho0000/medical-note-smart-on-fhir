import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { randomUUID } from 'node:crypto'
import { HfMedcloudDryRun } from '@/features/medical-calculator/prognosis/HfMedcloudDryRun'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'
import { shouldUseLocalBundle } from '@/src/infrastructure/fhir/client/fhir-client.service'
import { captureHfCallerAuth } from '@/src/infrastructure/hf-risk/caller-auth'
import { requestHfDryRun } from '@/src/infrastructure/hf-risk/dry-run-client'
import { hfMedcloudFixture } from './hf-medcloud-fixture'
import type { HfDryRunResult } from '@/src/core/hf-risk/contract'

jest.mock('@/src/infrastructure/fhir/services/local-bundle.service', () => ({ LocalBundleService: { getActiveImportId: jest.fn(), load: jest.fn() } }))
jest.mock('@/src/infrastructure/fhir/client/fhir-client.service', () => ({ shouldUseLocalBundle: jest.fn() }))
jest.mock('@/src/infrastructure/hf-risk/caller-auth', () => ({ captureHfCallerAuth: jest.fn() }))
jest.mock('@/src/infrastructure/hf-risk/dry-run-client', () => ({
  ...jest.requireActual('@/src/infrastructure/hf-risk/dry-run-client'), requestHfDryRun: jest.fn(),
}))
const accepted: HfDryRunResult = { verdict: 'accepted', issues: [{ severity: 'information', code: 'informational', text: 'Synthetic input checked' }] }
let importId: string
const getToken = jest.fn()
let identityChanged: (() => void) | undefined
const onIdentityChanged = jest.fn(callback => { identityChanged = callback; return jest.fn() })
async function prepare() {
  fireEvent.click(screen.getByRole('button', { name: '整理健保雲端模型資料' }))
  await screen.findByRole('combobox', { name: '門診基準日／院所代碼' })
}
beforeEach(() => {
  jest.clearAllMocks()
  identityChanged = undefined
  process.env.NEXT_PUBLIC_HF_GATEWAY_ORIGIN = 'https://hf.test'
  Object.defineProperty(global.crypto, 'randomUUID', { configurable: true, value: randomUUID })
  importId = 'synthetic-import-1'
  jest.mocked(LocalBundleService.getActiveImportId).mockImplementation(() => importId)
  jest.mocked(LocalBundleService.load).mockResolvedValue(hfMedcloudFixture())
  jest.mocked(shouldUseLocalBundle).mockReturnValue(true)
  getToken.mockResolvedValue('SYNTHETIC-CALLER')
  jest.mocked(captureHfCallerAuth).mockResolvedValue({ getToken, onIdentityChanged })
  jest.mocked(requestHfDryRun).mockResolvedValue(accepted)
})
afterEach(() => { delete process.env.NEXT_PUBLIC_HF_GATEWAY_ORIGIN })

it('prepares data locally with no automatic network requests and explains the transmitted inputs', async () => {
  const bundle = hfMedcloudFixture()
  bundle.entry[0].resource.birthDate = '1960'
  jest.mocked(LocalBundleService.load).mockResolvedValue(bundle)
  render(<HfMedcloudDryRun locale="zh-TW" />)
  expect(LocalBundleService.load).not.toHaveBeenCalled()
  await prepare()
  expect(screen.getByText(/生日未含完整年月日/)).toBeVisible()
  expect(screen.getByText(/不含姓名、身分證或無關內容/)).toBeVisible()
  expect(requestHfDryRun).not.toHaveBeenCalled()
  expect(captureHfCallerAuth).not.toHaveBeenCalled()
})
it('shows an unavailable configuration without a direct HTTP fallback', async () => {
  delete process.env.NEXT_PUBLIC_HF_GATEWAY_ORIGIN
  render(<HfMedcloudDryRun locale="zh-TW" />)
  await prepare()
  expect(screen.getByRole('button', { name: '執行院內輸入檢查' })).toBeDisabled()
  expect(screen.getByText('院內 HF 檢查服務尚未設定')).toBeVisible()
})
it('requires caller auth and never creates a new anonymous account', async () => {
  jest.mocked(captureHfCallerAuth).mockResolvedValue(null)
  render(<HfMedcloudDryRun locale="zh-TW" />)
  await prepare()
  fireEvent.click(screen.getByRole('button', { name: '執行院內輸入檢查' }))
  expect(await screen.findByText('尚未登入或未取得 HF 輸入檢查授權')).toBeVisible()
  expect(requestHfDryRun).not.toHaveBeenCalled()
})
it('displays input validation without representing it as a risk estimate', async () => {
  render(<HfMedcloudDryRun locale="zh-TW" />)
  await prepare()
  fireEvent.click(screen.getByRole('button', { name: '執行院內輸入檢查' }))
  expect(await screen.findByText('輸入檢查通過；資料來源適用性仍待驗證。')).toBeVisible()
  expect(screen.queryByText(/\d+%/)).toBeNull()
  expect(requestHfDryRun).toHaveBeenCalledTimes(1)
})
it('shows a 422 refusal and clears it when changing the model horizon', async () => {
  jest.mocked(requestHfDryRun).mockResolvedValue({ verdict: 'refused', issues: [{ severity: 'error', code: 'required', text: 'Synthetic missing input' }] })
  render(<HfMedcloudDryRun locale="zh-TW" />)
  await prepare()
  fireEvent.click(screen.getByRole('button', { name: '執行院內輸入檢查' }))
  await screen.findByText('Synthetic missing input')
  fireEvent.change(screen.getByRole('combobox', { name: '模型期間' }), { target: { value: 'P1_CD_mortality_3m' } })
  expect(screen.queryByText('Synthetic missing input')).toBeNull()
})
it('aborts and discards a late response after a different import, even for the same patient', async () => {
  let finish!: (value: HfDryRunResult) => void
  jest.mocked(requestHfDryRun).mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const view = render(<HfMedcloudDryRun locale="zh-TW" />)
  await prepare()
  fireEvent.click(screen.getByRole('button', { name: '執行院內輸入檢查' }))
  await waitFor(() => expect(requestHfDryRun).toHaveBeenCalled())
  const signal = jest.mocked(requestHfDryRun).mock.calls[0][1].signal
  importId = 'synthetic-import-2'
  view.rerender(<HfMedcloudDryRun locale="zh-TW" />)
  expect(signal.aborted).toBe(true)
  await act(async () => finish(accepted))
  expect(screen.queryByText(/輸入檢查通過/)).toBeNull()
  expect(screen.queryByRole('combobox')).toBeNull()
})
it('discards a response after sign-out', async () => {
  let finish!: (value: HfDryRunResult) => void
  jest.mocked(requestHfDryRun).mockImplementation(() => new Promise(resolve => { finish = resolve }))
  render(<HfMedcloudDryRun locale="zh-TW" />)
  await prepare()
  fireEvent.click(screen.getByRole('button', { name: '執行院內輸入檢查' }))
  await waitFor(() => expect(requestHfDryRun).toHaveBeenCalled())
  getToken.mockResolvedValue(null)
  await act(async () => finish(accepted))
  expect(screen.queryByText(/輸入檢查通過/)).toBeNull()
})
it('does not use an old local import while a SMART chart is active', async () => {
  jest.mocked(shouldUseLocalBundle).mockReturnValue(false)
  render(<HfMedcloudDryRun locale="zh-TW" />)
  fireEvent.click(screen.getByRole('button', { name: '整理健保雲端模型資料' }))
  expect(await screen.findByText('目前資料不是 medcloud2 健保雲端 Bundle')).toBeVisible()
  expect(LocalBundleService.load).not.toHaveBeenCalled()
})


it('clears a completed validation after the caller identity changes', async () => {
  render(<HfMedcloudDryRun locale="zh-TW" />)
  await prepare()
  fireEvent.click(screen.getByRole('button', { name: '執行院內輸入檢查' }))
  await screen.findByText('輸入檢查通過；資料來源適用性仍待驗證。')
  act(() => identityChanged?.())
  expect(screen.queryByText(/輸入檢查通過/)).toBeNull()
  expect(screen.getByText('尚未登入或未取得 HF 輸入檢查授權')).toBeVisible()
})
it('clears a completed local validation when the active source becomes SMART', async () => {
  const view = render(<HfMedcloudDryRun locale="zh-TW" />)
  await prepare()
  fireEvent.click(screen.getByRole('button', { name: '執行院內輸入檢查' }))
  await screen.findByText('輸入檢查通過；資料來源適用性仍待驗證。')
  jest.mocked(shouldUseLocalBundle).mockReturnValue(false)
  view.rerender(<HfMedcloudDryRun locale="zh-TW" />)
  expect(screen.queryByText(/輸入檢查通過/)).toBeNull()
  expect(screen.queryByRole('combobox')).toBeNull()
})
