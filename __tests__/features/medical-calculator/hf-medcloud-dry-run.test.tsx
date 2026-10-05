import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { randomUUID } from 'node:crypto'
import { HfMedcloudDryRun } from '@/features/medical-calculator/prognosis/HfMedcloudDryRun'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'
import { shouldUseLocalBundle } from '@/src/infrastructure/fhir/client/fhir-client.service'
import { captureHfCallerAuth } from '@/src/infrastructure/hf-risk/caller-auth'
import { requestHfDryRun, requestHfPrediction } from '@/src/infrastructure/hf-risk/dry-run-client'
import { hfMedcloudFixture } from './hf-medcloud-fixture'
import type { HfDryRunResult } from '@/src/core/hf-risk/contract'

jest.mock('@/src/infrastructure/fhir/services/local-bundle.service', () => ({ LocalBundleService: { getActiveImportId: jest.fn(), load: jest.fn() } }))
jest.mock('@/src/infrastructure/fhir/client/fhir-client.service', () => ({ shouldUseLocalBundle: jest.fn() }))
jest.mock('@/src/infrastructure/hf-risk/caller-auth', () => ({ captureHfCallerAuth: jest.fn() }))
jest.mock('@/src/infrastructure/hf-risk/dry-run-client', () => ({
  ...jest.requireActual('@/src/infrastructure/hf-risk/dry-run-client'), requestHfDryRun: jest.fn(), requestHfPrediction: jest.fn(),
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
afterEach(() => { delete process.env.NEXT_PUBLIC_HF_GATEWAY_ORIGIN; delete process.env.NEXT_PUBLIC_HF_AUTH_POLICY })

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
  expect(await screen.findByText('尚未登入或未取得 HF 服務授權')).toBeVisible()
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
  expect(screen.getByText('尚未登入或未取得 HF 服務授權')).toBeVisible()
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

it('explicit intranet policy submits without Firebase and shows warnings on an accepted response', async () => {
  process.env.NEXT_PUBLIC_HF_AUTH_POLICY = 'intranet'
  jest.mocked(captureHfCallerAuth).mockResolvedValue(null)
  jest.mocked(requestHfDryRun).mockResolvedValue({ verdict: 'accepted', issues: [{ severity: 'warning', code: 'business-rule', text: 'Synthetic missing hemoglobin' }] })
  render(<HfMedcloudDryRun locale="zh-TW" />)
  await prepare()
  expect(screen.getByText('本次輸入摘要')).toBeVisible()
  expect(screen.getByText(/未提供的模型檢驗項目/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '執行院內輸入檢查' }))
  expect(await screen.findByText('輸入檢查通過，但有資料警告；未計算風險。')).toBeVisible()
  expect(captureHfCallerAuth).not.toHaveBeenCalled()
  expect(requestHfDryRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ authPolicy: 'intranet' }))
  expect(screen.getByText(/Synthetic missing hemoglobin/)).toBeVisible()
  fireEvent.change(screen.getByRole('combobox', { name: '模型期間' }), { target: { value: 'P1_CD_mortality_3m' } })
  expect(screen.queryByText('輸入檢查通過，但有資料警告；未計算風險。')).toBeNull()
})
it('invalid authorization policy fails closed', async () => {
  process.env.NEXT_PUBLIC_HF_AUTH_POLICY = 'arbitrary'
  render(<HfMedcloudDryRun locale="zh-TW" />)
  await prepare()
  expect(screen.getByRole('button', { name: '執行院內輸入檢查' })).toBeDisabled()
  expect(requestHfDryRun).not.toHaveBeenCalled()
})

const predicted = { schemaVersion: 1 as const, verdict: 'scored' as const, claim: 'P1_CD_mortality_1m' as const, indexDate: '2026-01-01', probability: 0.1234, tier: 'intermediate' as const, horizonMonths: 1 as const, computedAt: '2026-10-05T08:00:00Z', notes: ['Synthetic coverage warning'], model: { name: 'Synthetic HF model', versions: [{type:'model-sha256',value:'a'.repeat(64)}] } }
it('requires a successful check before an explicit prediction and keeps warnings with the score', async () => {
  process.env.NEXT_PUBLIC_HF_AUTH_POLICY = 'intranet'
  jest.mocked(requestHfPrediction).mockResolvedValue(predicted)
  render(<HfMedcloudDryRun locale="zh-TW" />)
  await prepare()
  expect(screen.getByRole('button',{name:'執行 HF 模型預測'})).toBeDisabled()
  expect(requestHfPrediction).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'執行院內輸入檢查'}))
  await screen.findByText('輸入檢查通過；資料來源適用性仍待驗證。')
  expect(requestHfPrediction).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'執行 HF 模型預測'}))
  expect(await screen.findByText('12.34%')).toBeVisible()
  expect(screen.getByText('Synthetic coverage warning')).toBeVisible()
  expect(screen.getByText(/研究試辦版本，尚未取得醫療器材許可證/)).toBeVisible()
  expect(requestHfPrediction).toHaveBeenCalledTimes(1)
  fireEvent.change(screen.getByRole('combobox',{name:'模型期間'}),{target:{value:'P1_CD_mortality_3m'}})
  expect(screen.queryByText('12.34%')).toBeNull()
  expect(screen.getByRole('button',{name:'執行 HF 模型預測'})).toBeDisabled()
})
it('displays a prediction refusal without a low-risk result', async () => {
  process.env.NEXT_PUBLIC_HF_AUTH_POLICY = 'intranet'
  jest.mocked(requestHfPrediction).mockResolvedValue({schemaVersion:1,verdict:'refused',claim:'P1_CD_mortality_1m',indexDate:'2026-01-01',issues:[{severity:'error',code:'required',text:'Synthetic missing creatinine'}]})
  render(<HfMedcloudDryRun locale="zh-TW" />)
  await prepare()
  fireEvent.click(screen.getByRole('button',{name:'執行院內輸入檢查'}))
  await screen.findByText('輸入檢查通過；資料來源適用性仍待驗證。')
  fireEvent.click(screen.getByRole('button',{name:'執行 HF 模型預測'}))
  expect(await screen.findByText('資料不足或不相容，無法評估')).toBeVisible()
  expect(screen.getByText('這不是低風險結果。')).toBeVisible()
  expect(screen.queryByText(/\d+%/)).toBeNull()
})
it('drops a late prediction when switching the source import', async () => {
  process.env.NEXT_PUBLIC_HF_AUTH_POLICY = 'intranet'
  let finish!: (value: typeof predicted) => void
  jest.mocked(requestHfPrediction).mockImplementation(() => new Promise(resolve => {finish=resolve}))
  const view=render(<HfMedcloudDryRun locale="zh-TW" />)
  await prepare()
  fireEvent.click(screen.getByRole('button',{name:'執行院內輸入檢查'}))
  await screen.findByText('輸入檢查通過；資料來源適用性仍待驗證。')
  fireEvent.click(screen.getByRole('button',{name:'執行 HF 模型預測'}))
  await waitFor(() => expect(requestHfPrediction).toHaveBeenCalled())
  const signal=jest.mocked(requestHfPrediction).mock.calls[0][1].signal
  importId='synthetic-other-import'
  view.rerender(<HfMedcloudDryRun locale="zh-TW" />)
  expect(signal.aborted).toBe(true)
  await act(async () => finish(predicted))
  expect(screen.queryByText('12.34%')).toBeNull()
})

it('drops a local connection error after switching to a SMART chart', async () => {
  jest.mocked(requestHfDryRun).mockRejectedValue(new Error('gateway-unavailable'))
  const view=render(<HfMedcloudDryRun locale="zh-TW" />)
  await prepare()
  fireEvent.click(screen.getByRole('button',{name:'執行院內輸入檢查'}))
  await screen.findByText('無法完成檢查，請確認院內連線後重試')
  jest.mocked(shouldUseLocalBundle).mockReturnValue(false)
  view.rerender(<HfMedcloudDryRun locale="zh-TW" />)
  expect(screen.queryByText('無法完成檢查，請確認院內連線後重試')).toBeNull()
})
it('keeps the HF input surface usable on a hospital launch query', async () => {
  window.history.replaceState(null,'','/?medcloud2=auto&site=vghtpe')
  try {
    process.env.NEXT_PUBLIC_HF_AUTH_POLICY='intranet'
    render(<HfMedcloudDryRun locale="zh-TW" />)
    await prepare()
    expect(screen.getByRole('button',{name:'執行院內輸入檢查'})).toBeEnabled()
  } finally { window.history.replaceState(null,'','/') }
})
