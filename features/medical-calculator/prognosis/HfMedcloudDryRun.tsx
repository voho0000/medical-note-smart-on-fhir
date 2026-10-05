'use client'

import { useMedcloudHfDryRun } from '@/src/application/hooks/hf-risk/use-medcloud-hf-dry-run.hook'
import { summarizeHfInput } from '@/src/core/hf-risk/input-summary'
import { HfPredictionResultView } from './HfPredictionResult'
import type { HfSelection } from '@/src/core/hf-risk/contract'

const GAP: Record<string, [string, string]> = {
  'index-diagnosis-missing': ['門診缺少可核對的 ICD-10-CM／ICD-9-CM 診斷；一般 ICD-10 不自行換碼，請修正來源診斷系統後重新匯入', 'The visit lacks a verified ICD-10-CM/ICD-9-CM diagnosis; generic ICD-10 is not relabelled. Correct the source diagnosis system and import again'],
  'hospital-name-only': ['來源僅提供院所名稱；同名院所無法可靠區分，請核對所選院所及資料範圍', 'Source provides hospital names only; identically named institutions cannot be distinguished reliably. Verify hospital identity and record scope'],
  'patient-birthdate': ['生日未含完整年月日；不以出生年推算日期', 'Full birth date missing; no date inferred from a birth year'],
  'patient-sex': ['性別缺漏或不符合模型定義', 'Sex missing or outside the model definition'],
  'source-validation-pending': ['這份病歷來源的模型適用性尚未驗證', 'Model applicability to this record source has not been validated'],
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
  'diagnosis-unmapped': ['診斷碼系統或格式無法確認，未送出', 'Unrecognized diagnosis system or code format; excluded'],
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
  'preview-fixture-required': ['本機中繼僅接受指定合成病例，這份資料未送出', 'Local relay accepts only pinned synthetic cases; this data was not sent'],
  'duplicate-reference': ['病歷包含重複資源編號，請重新匯入', 'Duplicate resource references; import the record again'],
  'index-encounter-invalid': ['所選門診資料無效，請重新整理輸入', 'Selected visit is invalid; prepare inputs again'],
  'input-invalid': ['輸入資料不符合模型契約，請核對資料', 'Inputs do not match the model contract; review the data'],
  'input-too-large': ['整理後資料超過 2 MiB，無法送出', 'Prepared data exceeds the 2 MiB limit'],
  'response-too-large': ['服務回應超過大小限制，已丟棄', 'Oversized service response discarded'],
  'source-unsupported': ['請匯入雲端、健康或北榮懷爾抓抓的單一患者病歷', 'Import a single-patient cloud, health-bank or TVGH EHR bridge record'],
  'patient-count': ['需要單一患者的原始 Bundle', 'A single-patient source Bundle is required'],
  'bundle-invalid': ['無法讀取原始病歷 Bundle', 'Cannot read the source Bundle'],
  'no-visit': ['找不到院所來源與日期皆可辨識的門診紀錄；雲端來源另需可核對的 ICD 診斷', 'No outpatient visit with a known hospital and date; cloud records also require a recognized ICD diagnosis'],
  'source-changed': ['資料已切換，請重新整理輸入', 'Record changed; prepare the input again'],
  'gateway-unauthorized': ['尚未登入或未取得 HF 服務授權', 'Sign-in or HF service authorization required'],
  'gateway-config': ['院內 HF 檢查服務尚未設定', 'Intranet HF validation service is not configured'],
  'invalid-prediction-response': ['預測回應不符合模型契約，已丟棄', 'Prediction response does not match the model contract; discarded'],
  'invalid-dry-run-response': ['服務回應不符合輸入檢查格式，已丟棄', 'Invalid input-validation response discarded'],
}
export function HfMedcloudDryRun({ locale }: { locale: string }) {
  return <HfMedcloudDetail locale={locale} state={useMedcloudHfDryRun()} />
}

export function HfMedcloudDetail({ locale, state }: { locale: string; state: ReturnType<typeof useMedcloudHfDryRun> }) {
  const en = locale === 'en'
  const { current, configured, intranet, busy, result: visibleResult, prediction, message: visibleMessage, prepare, select, validate, predict } = state
  const summary = current ? summarizeHfInput(current.input) : null
  const missingIndexDiagnosis = current?.input.gaps.some(gap => gap.code === 'index-diagnosis-missing')
  const hasWarnings = visibleResult?.issues.some(issue => issue.severity === 'warning')
  const text = (pair: [string, string]) => pair[en ? 1 : 0]
  const button = 'min-h-11 rounded-md border border-border px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'
  const control = 'min-h-11 w-full rounded-md border border-border bg-background px-2 text-sm'
  return <section aria-label={en ? 'HF record model' : 'HF 病歷模型'} className="@container min-w-0 space-y-3 border-t border-border px-2.5 pb-3 pt-3" data-testid="hf-medcloud-dry-run">
    <div>
      <h3 className="text-sm font-semibold">{en ? 'TVGH HF AI-SaMD' : '北榮 HF AI-SaMD'}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{en ? 'Outpatient 1- and 3-month models. Check inputs first, then explicitly run prediction.' : '門診 1、3 個月模型。先檢查輸入，再手動執行預測。'}</p>
    </div>
    <button type="button" className={button} onClick={prepare} disabled={busy}>{en ? 'Prepare model input' : '整理模型資料'}</button>
    <p className="text-xs text-muted-foreground">{en ? 'Supports imported cloud, health-bank and TVGH EHR bridge records. Available inputs depend on the source data.' : '支援雲端、健康與北榮懷爾抓抓匯入的病歷；可用欄位依來源資料而定。'}</p>
    {intranet && <p className="text-xs text-muted-foreground">{en ? 'Hospital network authorization; no Firebase sign-in required. The service verifies access.' : '院內網路授權模式，不需 Firebase 登入；是否可用由院內服務驗證。'}</p>}
    {process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_HF_LOCAL_PREVIEW_RELAY === 'synthetic' && <p className="text-xs text-muted-foreground">{en ? 'Local preview relay: only the supplied synthetic fixture is accepted. Production browser CORS is not verified by this preview.' : '本機驗收中繼：僅接受指定合成病例；此預覽不代表正式瀏覽器 CORS 已通過。'}</p>}
    {current && <>
      <div className="grid gap-3 @md:grid-cols-2">
        <label className="min-w-0 space-y-1 text-sm">{en ? 'Index visit / hospital' : '門診基準日／院所'}
          <select className={control} value={current.selection.encounter} disabled={busy} onChange={event => {
            const visit = current.visits.find(visit => visit.reference === event.target.value)
            if (visit) select({ ...current.selection, encounter: visit.reference, provider: visit.provider })
          }}>{current.visits.map((visit, index) => <option key={visit.reference} value={visit.reference}>{visit.date} · {visit.providerName ?? visit.provider}{current.source === 'medcloud' ? ` · ${visit.provider}` : ''} · {index + 1}</option>)}</select>
        </label>
        <label className="min-w-0 space-y-1 text-sm">{en ? 'Model time horizon' : '模型期間'}
          <select className={control} value={current.selection.claim} disabled={busy} onChange={event => select({ ...current.selection, claim: event.target.value as HfSelection['claim'] })}>
            <option value="P1_CD_mortality_1m">{en ? 'In-hospital death within 1 month of visit' : '就診後 1 個月內院內死亡'}</option>
            <option value="P1_CD_mortality_3m">{en ? 'In-hospital death within 3 months of visit' : '就診後 3 個月內院內死亡'}</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">{en ? 'Record source' : '病歷來源'}：{current.source === 'medcloud' ? (en ? 'NHI cloud bridge' : '雲端懷爾抓抓') : current.source === 'health-bank' ? (en ? 'Health-bank bridge' : '健康懷爾抓抓') : (en ? 'TVGH EHR bridge' : '北榮懷爾抓抓')}</p>
      <h4 className="text-sm font-semibold">{en ? 'Input summary' : '本次輸入摘要'}</h4>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt>{en ? 'Hospital' : '院所'}</dt><dd className="min-w-0 break-words">{current.visits.find(visit => visit.reference === current.selection.encounter)?.providerName ?? current.selection.provider}</dd>
        <dt>{en ? 'Index date' : '門診基準日'}</dt><dd className="tabular-nums">{current.input.indexDate}</dd>
        <dt>{en ? 'Collection dates' : '採檢日期'}</dt><dd className="min-w-0 break-words tabular-nums">{summary?.dates.length ? `${summary.dates[0]} – ${summary.dates.at(-1)} · ${summary.dates.length} ${en ? 'days' : '天'}` : (en ? 'No usable labs' : '沒有可用檢驗')}</dd>
      </dl>
      <p className="text-xs text-muted-foreground">{en ? 'Outcome: death during hospitalization at TVGH; deaths outside TVGH are not included.' : '結局定義為北榮院內死亡，不包含院外或他院死亡；這份病歷來源適用性尚待驗證。'}</p>
      <p className="text-sm tabular-nums">{en ? 'Prepared inputs' : '整理後資料'}：{en ? 'visits' : '就診'} {current.input.counts.Encounter ?? 0} · {en ? 'diagnoses' : '診斷'} {current.input.counts.Condition ?? 0} · {en ? 'labs' : '檢驗'} {current.input.counts.Observation ?? 0} · {en ? 'procedures' : '處置'} {current.input.counts.Procedure ?? 0}</p>
      {summary && summary.missingLabs.length > 0 && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer py-2">{en ? 'Missing model lab items' : '未提供的模型檢驗項目'} · {summary.missingLabs.length}</summary><p className="break-words">{summary.missingLabs.map(key => key === 'BNP' ? 'NT-proBNP' : key).join('、')}</p><p>{en ? 'Missing tests are not treated as normal or zero. The model may accept inputs with warnings.' : '缺值不當作正常或零值；模型可能接受輸入並回傳缺漏警告。'}</p></details>}
      <h4 className="text-sm font-semibold">{en ? 'Source checks and gaps' : '來源檢查與缺漏'}</h4>
      <ul className="space-y-1 text-xs text-muted-foreground">{current.input.gaps.map(gap => {
        const [code, moduleName] = gap.code.split(':')
        return <li key={gap.code}>{text(GAP[code] ?? [code, code])}{moduleName ? ' (' + text(MODULE[moduleName] ?? [moduleName, moduleName]) + ')' : ''}{gap.count > 1 ? ' · ' + gap.count : ''}</li>
      })}</ul>
      <p className="text-xs text-muted-foreground">{en ? 'Submitting sends the prepared birth date, sex and selected-hospital clinical inputs to the intranet service. Names and identity numbers are excluded.' : '執行檢查會將整理後的生日、性別與所選院所臨床資料送至院內服務；不含姓名、身分證或無關內容。'}</p>
      <button type="button" className={button} disabled={busy || !configured || missingIndexDiagnosis} onClick={validate}>
        {busy ? (en ? 'Processing…' : '處理中…') : (en ? 'Run intranet input validation' : '執行院內輸入檢查')}
      </button>
      <button type="button" className={button + ' bg-primary text-primary-foreground'} disabled={busy || !configured || visibleResult?.verdict !== 'accepted'} onClick={predict}>
        {busy ? (en ? 'Processing…' : '處理中…') : (en ? 'Run HF model prediction' : '執行 HF 模型預測')}
      </button>
      {visibleResult?.verdict !== 'accepted' && <p className="text-xs text-muted-foreground">{en ? 'Prediction becomes available after input checks pass. Warnings remain relevant even when accepted.' : '請先完成輸入檢查；即使通過，仍需核對資料警告。'}</p>}
    </>}
    {!configured && <p className="text-xs text-muted-foreground">{text(ERRORS['gateway-config'])}</p>}
    <div role="status" aria-live="polite" className="space-y-1 text-sm">
      {visibleMessage && <p>{visibleMessage === 'gateway-unauthorized' && intranet ? (en ? 'The service denied hospital network access; verify the approved network and ingress settings.' : '院內服務拒絕存取；請確認核准網段與入口設定。') : text(ERRORS[visibleMessage] ?? ['無法完成檢查，請確認院內連線後重試', 'Unable to validate; check the intranet connection and retry'])}</p>}
      {visibleResult && <>
        <h4 className="pt-3 text-sm font-semibold">{en ? 'Input-check result' : '輸入檢查結果'}</h4>
        <p className="text-xs text-muted-foreground">{en ? 'This input-check result confirms only format and eligibility; it is not a risk estimate. Model prediction is displayed separately below.' : '下列輸入檢查結果僅確認格式與評分條件，不是風險估計；模型預測另列於下方。'}</p>
        <p className="font-medium">{visibleResult.verdict === 'accepted'
          ? (hasWarnings ? (en ? 'Input check passed with warnings; no risk calculated.' : '輸入檢查通過，但有資料警告；未計算風險。') : (en ? 'Input check passed; source applicability still requires validation.' : '輸入檢查通過；資料來源適用性仍待驗證。'))
          : (en ? 'Input check refused; review missing or incompatible data.' : '輸入檢查未通過；請核對缺漏或不相容資料。')}</p>
        <p className="text-xs text-muted-foreground">{en ? 'Index date' : '基準日'}：{current?.input.indexDate} · {current?.input.claim === 'P1_CD_mortality_1m' ? (en ? '1 month' : '1 個月') : (en ? '3 months' : '3 個月')}</p>
        <ul className="space-y-1 text-xs text-muted-foreground">{visibleResult.issues.map((issue, index) => <li key={index}><span className="font-medium">{issue.severity === 'warning' ? (en ? 'Warning: ' : '警告：') : ['error', 'fatal'].includes(issue.severity) ? (en ? 'Error: ' : '錯誤：') : ''}</span>{issue.text}</li>)}</ul>
        <details className="text-xs text-muted-foreground"><summary className="cursor-pointer py-2">{en ? 'Validation provenance' : '檢查紀錄與版本'}</summary>
          <p>{en ? 'Checked at' : '檢查時間'}：{visibleResult.checkedAt ?? (en ? 'Not provided' : '未提供')}</p>
          <p>{en ? 'Adapter version' : '串接版本'}：{visibleResult.adapterVersion ?? (en ? 'Not provided' : '未提供')}</p>
          <p>{en ? 'Model version and calibration: not established by dry-run.' : '模型版本與校正：dry-run 未確認，不能以串接版本替代。'}</p>
          {visibleResult.requestId && <p className="break-all">Request ID：{visibleResult.requestId}</p>}
        </details>
      </>}
      {prediction && <HfPredictionResultView result={prediction} locale={locale} />}
    </div>
  </section>
}
