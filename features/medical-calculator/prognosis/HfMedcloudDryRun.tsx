'use client'

import { useMedcloudHfDryRun } from '@/src/application/hooks/hf-risk/use-medcloud-hf-dry-run.hook'
import type { HfSelection } from '@/src/core/hf-risk/contract'

const GAP: Record<string, [string, string]> = {
  'patient-birthdate': ['生日未含完整年月日；不以出生年推算日期', 'Full birth date missing; no date inferred from a birth year'],
  'patient-sex': ['性別缺漏或不符合模型定義', 'Sex missing or outside the model definition'],
  'source-validation-pending': ['健保雲端來源的模型適用性尚未驗證', 'Model applicability to NHI cloud records has not been validated'],
  'history-coverage-unverified': ['尚未確認各模組、院所與期間的資料涵蓋度', 'Coverage by module, hospital and time window remains unverified'],
  'module-unknown': ['必要歷史資料模組未標示擷取狀態', 'History module capture status unknown'],
  'module-incomplete': ['歷史資料模組擷取不完整或失敗', 'History module capture incomplete or failed'],
  'source-omitted': ['其他院所、來源不明或來源衝突的紀錄未送出', 'Other-hospital, unknown-source or conflicting-source records excluded'],
  'void-omitted': ['取消、作廢或未執行紀錄未送出', 'Cancelled, void or not-done records excluded'],
  'future-omitted': ['門診基準日之後的紀錄未送出', 'Records after the index visit excluded'],
  'encounter-date': ['就診日期缺漏或無效，未送出', 'Encounter date missing or invalid; excluded'],
  'encounter-class': ['就診類別不明，未送出', 'Unknown encounter class; excluded'],
  'encounter-duplicate': ['完全相同的住院紀錄已去重', 'Identical inpatient episodes deduplicated'],
  'department-unmapped': ['科別尚未對照，相關就診次數可能低估', 'Department unmapped; visit counts may be underestimated'],
  'ongoing-diagnoses-omitted': ['基準日尚未結束的住院，未採用事後申報診斷', 'Later claims diagnoses from ongoing admissions excluded'],
  'diagnosis-rank-missing': ['住院診斷未提供主次序，不自行推定', 'Inpatient diagnosis rank missing; no rank inferred'],
  'lab-status': ['檢驗尚未確認完成，未送出', 'Unconfirmed laboratory results excluded'],
  'lab-unmapped': ['檢驗項目無已核對的 LOINC 對照，或不在模型項目中，未送出', 'Lab not in the audited model mapping; excluded'],
  'lab-date': ['檢驗未提供有效採檢日期，未送出', 'Valid collection date missing; excluded'],
  'lab-value-unit': ['檢驗數值或單位無法確認／換算，未送出', 'Lab value or unit cannot be validated/converted; excluded'],
  'lab-none': ['沒有可用的模型檢驗資料', 'No usable model laboratory inputs'],
  'procedure-date': ['處置執行日期不明，未送出', 'Procedure date unknown; excluded'],
  'procedure-unmapped': ['處置缺少模型接受的 ICD 碼或住院關聯，未送出', 'Procedure lacks a supported ICD code or inpatient link; excluded'],
}
const MODULE: Record<string, [string, string]> = {
  imue0008: ['用藥與就診', 'Medication and visits'], imue0060: ['檢驗', 'Laboratory'],
  imue0070: ['住院', 'Admissions'], imue0020: ['手術', 'Surgery'],
}
const ERRORS: Record<string, [string, string]> = {
  'source-not-medcloud': ['目前資料不是 medcloud2 健保雲端 Bundle', 'Current Bundle is not a medcloud2 NHI cloud import'],
  'patient-count': ['需要單一患者的原始 Bundle', 'A single-patient source Bundle is required'],
  'bundle-invalid': ['無法讀取原始病歷 Bundle', 'Cannot read the source Bundle'],
  'no-visit': ['找不到院所來源、日期與 ICD 診斷皆可辨識的門診紀錄', 'No outpatient visit with a known hospital, date and ICD diagnosis'],
  'source-changed': ['資料已切換，請重新整理輸入', 'Record changed; prepare the input again'],
  'gateway-unauthorized': ['尚未登入或未取得 HF 輸入檢查授權', 'Sign-in or HF input validation authorization required'],
  'gateway-config': ['院內 HF 檢查服務尚未設定', 'Intranet HF validation service is not configured'],
  'invalid-dry-run-response': ['服務回應不符合輸入檢查格式，已丟棄', 'Invalid input-validation response discarded'],
}
export function HfMedcloudDryRun({ locale }: { locale: string }) {
  const en = locale === 'en'
  const { current, configured, busy, result: visibleResult, message: visibleMessage, prepare, select, validate } = useMedcloudHfDryRun()
  const text = (pair: [string, string]) => pair[en ? 1 : 0]
  const button = 'min-h-11 rounded-md border border-border px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'
  const control = 'min-h-11 w-full rounded-md border border-border bg-background px-2 text-sm'
  return <section aria-label={en ? 'HF cloud record input validation' : 'HF 健保雲端模型輸入檢查'} className="@container min-w-0 space-y-3 border-t border-border px-2.5 pb-3 pt-3" data-testid="hf-medcloud-dry-run">
    <div>
      <h3 className="text-sm font-semibold">{en ? 'Team AI-SaMD · input validation' : '團隊 AI-SaMD・輸入檢查'}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{en ? 'Outpatient 1- and 3-month models. Input validation only; no risk estimate.' : '門診 1、3 個月模型。此階段只檢查輸入，不計算風險。'}</p>
    </div>
    <button type="button" className={button} onClick={prepare} disabled={busy}>{en ? 'Prepare cloud record input' : '整理健保雲端模型資料'}</button>
    {current && <>
      <div className="grid gap-3 @md:grid-cols-2">
        <label className="min-w-0 space-y-1 text-sm">{en ? 'Index visit / hospital code' : '門診基準日／院所代碼'}
          <select className={control} value={current.selection.encounter} disabled={busy} onChange={event => {
            const visit = current.visits.find(visit => visit.reference === event.target.value)
            if (visit) select({ ...current.selection, encounter: visit.reference, provider: visit.provider })
          }}>{current.visits.map((visit, index) => <option key={visit.reference} value={visit.reference}>{visit.date} · {visit.providerName ?? visit.provider} · {visit.provider} · {index + 1}</option>)}</select>
        </label>
        <label className="min-w-0 space-y-1 text-sm">{en ? 'Model time horizon' : '模型期間'}
          <select className={control} value={current.selection.claim} disabled={busy} onChange={event => select({ ...current.selection, claim: event.target.value as HfSelection['claim'] })}>
            <option value="P1_CD_mortality_1m">{en ? '1 month' : '1 個月'}</option>
            <option value="P1_CD_mortality_3m">{en ? '3 months' : '3 個月'}</option>
          </select>
        </label>
      </div>
      <p className="text-sm tabular-nums">{en ? 'Prepared inputs' : '整理後資料'}：{en ? 'visits' : '就診'} {current.input.counts.Encounter ?? 0} · {en ? 'diagnoses' : '診斷'} {current.input.counts.Condition ?? 0} · {en ? 'labs' : '檢驗'} {current.input.counts.Observation ?? 0} · {en ? 'procedures' : '處置'} {current.input.counts.Procedure ?? 0}</p>
      <ul className="space-y-1 text-xs text-muted-foreground">{current.input.gaps.map(gap => {
        const [code, moduleName] = gap.code.split(':')
        return <li key={gap.code}>{text(GAP[code] ?? [code, code])}{moduleName ? ' (' + text(MODULE[moduleName] ?? [moduleName, moduleName]) + ')' : ''}{gap.count > 1 ? ' · ' + gap.count : ''}</li>
      })}</ul>
      <p className="text-xs text-muted-foreground">{en ? 'Submitting sends the prepared birth date, sex and selected-hospital clinical inputs to the intranet service. Names and identity numbers are excluded.' : '執行檢查會將整理後的生日、性別與所選院所臨床資料送至院內服務；不含姓名、身分證或無關內容。'}</p>
      <button type="button" className={button + ' bg-primary text-primary-foreground'} disabled={busy || !configured} onClick={validate}>
        {busy ? (en ? 'Checking input…' : '檢查中…') : (en ? 'Run intranet input validation' : '執行院內輸入檢查')}
      </button>
    </>}
    {!configured && <p className="text-xs text-muted-foreground">{text(ERRORS['gateway-config'])}</p>}
    <div role="status" aria-live="polite" className="space-y-1 text-sm">
      {visibleMessage && <p>{text(ERRORS[visibleMessage] ?? ['無法完成檢查，請確認院內連線後重試', 'Unable to validate; check the intranet connection and retry'])}</p>}
      {visibleResult && <>
        <p className="font-medium">{visibleResult.verdict === 'accepted'
          ? (en ? 'Input check passed; source applicability still requires validation.' : '輸入檢查通過；資料來源適用性仍待驗證。')
          : (en ? 'Input check refused; review missing or incompatible data.' : '輸入檢查未通過；請核對缺漏或不相容資料。')}</p>
        <ul className="space-y-1 text-xs text-muted-foreground">{visibleResult.issues.map((issue, index) => <li key={index}>{issue.text}</li>)}</ul>
      </>}
    </div>
  </section>
}
