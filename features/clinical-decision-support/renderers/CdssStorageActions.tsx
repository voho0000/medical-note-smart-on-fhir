'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { latestCdssSave } from '../telemetry/latest-cdss-save'
import { assessmentFingerprint, savedAssessmentFingerprint, restoreSavedAssessment } from '../stores/saved-assessment'
import { toast } from 'sonner'
import { isDeidentifiedPatient } from '@/src/core/entities/patient.entity'
import { useAuth } from '@/src/application/providers/auth.provider'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { storedTimestampForDisplay } from '@/src/shared/contracts/cdss-stored-save-v2'
import { cancelCdssGatewayRequests, cdssGatewayStatus, saveCdssSnapshot } from '../telemetry/cdss-gateway'
import { listCdssHistory, readCdssHistory, type CdssHistoryList, type CdssHistoryRecord } from '../telemetry/cdss-history'
import { authorizeFhir, disconnectFhir, fhirAuthStatus, fhirOAuthEnabled, subscribeFhirAuth } from '../telemetry/fhir-auth'

const isDeidentifiedFailure = (failure: unknown) => failure instanceof Error && failure.message === 'cdss_patient_deidentified'
const isIdentityFailure = (failure: unknown) => failure instanceof Error && failure.message === 'cdss_identity_unavailable'

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : {}
const text = (value: unknown) => typeof value === 'string' ? value : ''
const subscribeSite = (notify: () => void) => {
  window.addEventListener('popstate', notify)
  return () => window.removeEventListener('popstate', notify)
}
const fieldNames: Record<string, string> = { clinicVitals: '門診量測', hfpefInputs: '心超輸入', phenotypeAnswer: '疾病分型',
  evidenceOverrides: '證據選擇', afAnswers: 'AF 回答', nhiLipidReview: '血脂回答', nhiLipidReviewProvenance: '血脂資料來源',
  preventInputs: 'PREVENT 回答', visitAnswers: '本次問診回答', decision: '決策', reasons: '理由', note: '備註',
  entries: '量測項目', value: '數值', measuredOn: '日期', updatedAt: '更新時間', source: '來源' }

/** Saved data only. No rule evaluation, HTML injection, or writes to current answer stores. */
function SavedFields({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined) return <span>—</span>
  if (typeof value !== 'object') return <span className="whitespace-pre-wrap break-words">{String(value)}</span>
  if (depth >= 8) return <span>…</span>
  if (Array.isArray(value)) return <ul className="list-inside list-disc space-y-1">{value.map((item, index) =>
    <li key={index}><SavedFields value={item} depth={depth + 1} /></li>)}</ul>
  return <dl className="space-y-1">{Object.entries(value).map(([key, item]) => <div key={key} className="grid gap-1 border-b border-border py-1 sm:grid-cols-[10rem_1fr]">
    <dt className="break-words text-muted-foreground">{fieldNames[key] ?? key}</dt>
    <dd className="min-w-0"><SavedFields value={item} depth={depth + 1} /></dd>
  </div>)}</dl>
}

function SavedRecommendation({ value, english }: { value: unknown; english: boolean }) {
  const recommendation = object(value)
  const title = text(recommendation.title)
  const moduleName = text(recommendation.moduleName)
  const fields = [
    ['status', english ? 'Stored status' : '當時狀態'],
    ['recommendation', english ? 'Recommendation' : '建議'],
    ['rationale', english ? 'Rationale' : '判斷理由'],
    ['patientEvidence', english ? 'Patient evidence' : '病人證據'],
    ['missingData', english ? 'Missing data' : '缺少資料'],
    ['nextActions', english ? 'Next actions' : '下一步'],
    ['safetyBoundary', english ? 'Safety boundary' : '安全範圍'],
  ] as const
  return <section className="space-y-2 border-t border-border pt-2" data-testid="cdss-history-recommendation">
    <h4 className="whitespace-pre-wrap break-words font-medium">{title || moduleName}</h4>
    {title && moduleName && <p className="whitespace-pre-wrap break-words text-muted-foreground">{moduleName}</p>}
    <dl className="space-y-2">{fields.map(([key, label]) => <div key={key} className="space-y-1">
      <dt className="font-medium">{label}</dt>
      <dd className="min-w-0"><SavedFields value={recommendation[key]} /></dd>
    </div>)}</dl>
  </section>
}

type StorageProps = {
  /** Keep the save controller mounted when its button moves into the full-window header. */
  saveTarget?: HTMLElement | null
  input: Omit<Parameters<typeof saveCdssSnapshot>[0], 'sourceRecords'>
  sourceRecords: () => Parameters<typeof saveCdssSnapshot>[0]['sourceRecords']; english?: boolean
}

export function CdssStorageActions(props: StorageProps) {
  // Provider loading also includes Firestore profile writes; a known account can already authorize FHIR.
  const { user } = useAuth()
  const ownerUid = user?.uid
  return <OwnedStorageActions key={JSON.stringify([props.input.patient.id, ownerUid, isDeidentifiedPatient(props.input.patient)])} {...props} ownerUid={ownerUid} />
}

function OwnedStorageActions({ input, sourceRecords, english = false, saveTarget, ownerUid }: StorageProps & { ownerUid?: string }) {
  const enabled = useSyncExternalStore(subscribeSite, () => cdssGatewayStatus().enabled, () => false)
  const authorized = useSyncExternalStore(subscribeFhirAuth, () => fhirAuthStatus(ownerUid), () => false)
  const [authorizing, setAuthorizing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<'identity' | 'deidentified' | 'unavailable' | null>(null)
  const [history, setHistory] = useState<CdssHistoryList | null>(null)
  const [selected, setSelected] = useState<CdssHistoryRecord | null>(null)
  const controller = useRef<AbortController | null>(null)
  const [baseline, setBaseline] = useState<string | null | undefined>(undefined)
  const [checkRevision, setCheckRevision] = useState(0)
  const patientScope = JSON.stringify([input.patient.id, input.patient.name, input.patient.birthDate, input.patient.identifier, isDeidentifiedPatient(input.patient), ownerUid, fhirOAuthEnabled() ? authorized : true])
  const patientRef = useRef(input.patient)
  useEffect(() => { patientRef.current = input.patient }, [input.patient])
  const canRead = Boolean(enabled && ownerUid && (!fhirOAuthEnabled() || authorized) && !isDeidentifiedPatient(input.patient))
  const [restoreSignal, setRestoreSignal] = useState<AbortSignal | null>(null)
  const [historySignal, setHistorySignal] = useState<AbortSignal | null>(null)
  useEffect(() => () => controller.current?.abort(), [patientScope])
  const [restoreScope, setRestoreScope] = useState('')
  const [baselineScope, setBaselineScope] = useState('')
  const [historyScope, setHistoryScope] = useState('')
  const [baselineFailed, setBaselineFailed] = useState(false)
  const [checking, setChecking] = useState(false)
  const [restoreRecord, setRestoreRecord] = useState<CdssHistoryRecord | null>(null)
  const latestController = useRef<AbortController | null>(null)
  const fingerprint = assessmentFingerprint(input.physicianInputs, input.physicianDecisions, input.patient)
  const dirty = baselineScope === patientScope && baseline !== undefined && fingerprint !== (baseline ?? '{}')
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => {
    mounted.current = false; latestController.current?.abort(); controller.current?.abort(); cancelCdssGatewayRequests(); disconnectFhir()
  } }, [])
  const deidentifiedHelp = english
    ? 'Turn off the de-identification option in the export tool, then reimport the patient data.'
    : '請取消雲抓的「去識別化」選項後，重新匯入病人資料。'
  const identityHelp = english
    ? 'Check that the patient data includes a full name without masking characters, a valid date of birth, and a partially masked national ID. Then reimport the data and try again.'
    : '請確認病人資料包含完整姓名（不可含 ○ 等遮蔽字元）、有效出生日期，以及部分遮蔽的身分證字號；確認後重新匯入資料再試。'
  useEffect(() => {
    const request = new AbortController()
    latestController.current = request
    const patient = patientRef.current
    void (async () => {
      await Promise.resolve()
      if (request.signal.aborted) return
      if (!canRead || !ownerUid) { setChecking(false); setRestoreRecord(null); return }
      setChecking(true)
      setRestoreRecord(null)
      try {
        const saved = await latestCdssSave(patient, request.signal, ownerUid)
        if (!request.signal.aborted) {
          setBaselineScope(patientScope)
          setBaseline(saved ? savedAssessmentFingerprint(saved, patient) : null)
          setBaselineFailed(false)
        }
      } catch {
        if (!request.signal.aborted) setBaselineFailed(true)
      } finally { if (!request.signal.aborted) setChecking(false) }
    })()
    return () => { request.abort(); latestController.current?.abort() }
  }, [canRead, ownerUid, checkRevision, patientScope])
  const prepareRestore = async () => {
    if (!ownerUid || saving || checking || !enabled) return
    if (isDeidentifiedPatient(input.patient)) { toast.error(english ? 'De-identified patient data cannot be restored.' : '去識別化資料無法還原 CDSS 紀錄。', { description: deidentifiedHelp, duration: 10000 }); return }
    latestController.current?.abort()
    const request = new AbortController()
    latestController.current = request
    setChecking(true)
    try {
      const saved = await latestCdssSave(input.patient, request.signal, ownerUid)
      if (!saved) throw new Error('cdss_no_saved_record')
      if (!request.signal.aborted) { setRestoreScope(patientScope); setRestoreSignal(request.signal); setRestoreRecord(saved) }
    } catch (failure) {
      if (!request.signal.aborted) toast.error(failure instanceof Error && failure.message === 'cdss_no_saved_record'
        ? english ? 'No saved record for this patient.' : '此病人尚無可還原的儲存紀錄。'
        : english ? 'Saved record unavailable. Your draft is unchanged.' : '無法取得儲存紀錄，目前草稿未變更。')
    } finally { if (!request.signal.aborted) setChecking(false) }
  }
  const run = async (saveId?: string) => {
    if (!ownerUid) return
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    setHistorySignal(request.signal)
    setHistoryScope(patientScope)
    setLoading(true); setError(null); setSelected(null)
    if (!saveId) setHistory(null)
    try {
      if (saveId) {
        const result = await readCdssHistory(input.patient, saveId, request.signal, ownerUid)
        if (!request.signal.aborted) setSelected(result)
      } else {
        const result = await listCdssHistory(input.patient, request.signal, ownerUid)
        if (!request.signal.aborted) setHistory(result)
      }
    } catch (failure) {
      if (!request.signal.aborted) setError(isDeidentifiedFailure(failure) ? 'deidentified' : isIdentityFailure(failure) ? 'identity' : 'unavailable')
    }
    finally { if (!request.signal.aborted) setLoading(false) }
  }
  const save = async () => {
    if (!ownerUid || saving) return
    latestController.current?.abort()
    setChecking(false)
    const savedFingerprint = fingerprint
    setSaving(true)
    try {
      await saveCdssSnapshot({ ...input, ownerUid, sourceRecords: sourceRecords() })
      if (mounted.current) { setBaseline(savedFingerprint); setBaselineScope(patientScope); setBaselineFailed(false); toast.success(english ? 'CDSS record saved.' : 'CDSS 紀錄已儲存。') }
    } catch (failure) {
      if (mounted.current) {
        setCheckRevision(value => value + 1)
        if (isDeidentifiedFailure(failure)) {
          toast.error(english ? 'De-identified patient data cannot be saved as a CDSS record.' : '去識別化資料無法儲存 CDSS 紀錄。',
            { description: deidentifiedHelp, duration: 10000 })
        } else if (isIdentityFailure(failure)) {
          toast.error(english ? 'Patient identification failed. CDSS record was not saved.' : '病人識別失敗，CDSS 紀錄未儲存。',
            { description: identityHelp, duration: 10000 })
        } else {
          toast.error(english ? 'Record was not saved. Please try again.' : '紀錄未儲存，請稍後重試。')
        }
      }
    }
    finally { if (mounted.current) setSaving(false) }
  }
  if (!enabled) return null
  const label = english ? 'Saved CDSS records' : 'CDSS 歷史紀錄'
  const result = object(selected?.save.result)
  const recommendations = Array.isArray(result.recommendations) ? result.recommendations : []
  const status = !canRead ? english ? 'Saved state not checked' : '尚未確認儲存狀態' : checking ? english ? 'Checking saved state…' : '確認儲存狀態中…'
    : baselineFailed ? english ? 'Saved state could not be checked' : '無法確認最後儲存狀態'
    : baselineScope !== patientScope || baseline === undefined ? english ? 'Saved state not checked' : '尚未確認儲存狀態'
    : dirty ? english ? 'Unsaved changes' : '有未儲存變更'
    : baseline === null ? english ? 'No saved record' : '尚無儲存紀錄'
    : english ? 'Matches last saved state' : '與最後儲存狀態一致'
  const saveButton = <CdssSaveControls english={english} signedIn={Boolean(ownerUid)} saving={saving} status={status}
    saveDisabled={!ownerUid || saving || (fhirOAuthEnabled() && !authorized)}
    restoreDisabled={saving || checking || (fhirOAuthEnabled() && !authorized)}
    onSave={() => void save()} onRestore={() => void prepareRestore()} />
  return <div className="flex flex-wrap gap-2">
    {fhirOAuthEnabled() && <Button type="button" variant="outline" className="min-h-[44px] shadow-none" disabled={!ownerUid || authorizing}
      data-testid="cdss-fhir-authorize" onClick={() => {
        if (authorized) { disconnectFhir(); return }
        setAuthorizing(true)
        void authorizeFhir(ownerUid).catch(() => { if (mounted.current) toast.error(english ? 'FHIR authorization failed. Please try again.' : 'FHIR 授權未完成，請重試。') })
          .finally(() => { if (mounted.current) setAuthorizing(false) })
      }}>{authorizing ? english ? 'Authorizing…' : '授權中…' : authorized ? english ? 'Disconnect FHIR' : '斷開 FHIR 授權' : english ? 'Authorize FHIR' : '登入 FHIR 授權'}</Button>}
    {saveTarget ? createPortal(saveButton, saveTarget) : saveButton}
    <Button type="button" variant="outline" className="min-h-[44px] shadow-none" disabled={!ownerUid || (fhirOAuthEnabled() && !authorized)}
      onClick={() => { setOpen(true); void run() }} data-testid="cdss-history-records">{label}</Button>
    <Dialog open={Boolean(canRead && restoreRecord && restoreScope === patientScope && restoreSignal && !restoreSignal.aborted)} onOpenChange={value => { if (!value) setRestoreRecord(null) }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{english ? 'Restore last saved state' : '還原最後儲存狀態'}</DialogTitle>
          <DialogDescription>{english ? 'Replace the patient-wide answers and clinician decisions shared by all care packs with this latest snapshot. Unsaved changes will be discarded; original clinical dates are retained. AI answers require re-review when their source data has changed.'
            : '將以此病人最後紀錄取代所有指引共用的答案與醫師決策，捨棄未儲存變更；原始量測與評估日期會保留，舊日問診不會當作今日答案，AI 答案來源已變時需重新判讀。'}</DialogDescription>
        </DialogHeader>
        {restoreRecord && <p>{english ? 'Saved at: ' : '儲存時間：'}{new Date(storedTimestampForDisplay(restoreRecord.savedAt)).toLocaleString(english ? 'en' : 'zh-TW')}</p>}
        <p>{english ? 'Saved care pack: ' : '儲存的指引：'}{text(object(restoreRecord?.save.result).title) || restoreRecord?.packId}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => setRestoreRecord(null)}>{english ? 'Cancel' : '取消'}</Button>
          <Button type="button" className="min-h-[44px]" disabled={saving} onClick={() => {
            if (!canRead || !ownerUid || !restoreRecord || restoreScope !== patientScope || !restoreSignal || restoreSignal.aborted || !mounted.current) return
            restoreSavedAssessment(input.patient.id, restoreRecord)
            setBaselineScope(patientScope)
            setBaseline(savedAssessmentFingerprint(restoreRecord, input.patient))
            setBaselineFailed(false)
            setRestoreRecord(null)
            toast.success(english ? 'Saved answers restored. Assessment recalculated; stale AI answers require re-review.' : '已還原儲存答案並重新評估；AI 答案來源已變時需重新判讀。')
          }}>{english ? 'Confirm restore' : '確認還原'}</Button>
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={open && historyScope === patientScope && Boolean(historySignal && !historySignal.aborted)} onOpenChange={value => { setOpen(value); if (!value) controller.current?.abort() }}>
      <DialogContent className="sm:max-w-3xl" showCloseButton={false}>
        <DialogHeader><DialogTitle>{label}</DialogTitle>
          <DialogDescription>{english ? 'Your saved snapshots for this patient. Viewing leaves the current assessment unchanged.' : '您為此病人儲存的快照；調閱時保留目前的評估。'}</DialogDescription>
        </DialogHeader>
        {loading && <p role="status">{english ? 'Loading…' : '載入中…'}</p>}
        {error && <div role="alert"><p>{error === 'deidentified'
          ? english ? 'CDSS history cannot be retrieved for de-identified patient data.' : '去識別化資料無法查詢 CDSS 歷史紀錄。'
          : error === 'identity'
          ? english ? 'Patient identification failed. CDSS history cannot be retrieved.' : '病人識別失敗，無法取得 CDSS 歷史紀錄。'
          : english ? 'Records unavailable. Please try again.' : '目前無法取得紀錄，請稍後重試。'}</p>
          {error === 'deidentified' && <p className="mt-2 break-words">{deidentifiedHelp}</p>}
          {error === 'identity' && <p className="mt-2 break-words">{identityHelp}</p>}
          <Button type="button" variant="outline" className="mt-2 min-h-[44px]" onClick={() => void run()}>{english ? 'Retry' : '重試'}</Button></div>}
        {!loading && !error && !selected && history && <div className="space-y-2">
          {history.records.length === 0 && <p>{english ? 'No saved records.' : '尚無儲存紀錄。'}</p>}
          {history.records.map(item => <Button key={item.saveId} type="button" variant="outline" className="h-auto min-h-[44px] w-full justify-start whitespace-normal text-left shadow-none"
            onClick={() => void run(item.saveId)}><span className="min-w-0 break-words">{new Date(item.receivedAt).toLocaleString(english ? 'en' : 'zh-TW')} · {item.packId}</span></Button>)}
          {history.hasMore && <p className="text-muted-foreground">{english ? 'Showing the 10 most recently received records.' : '目前顯示最近收到的 10 筆紀錄。'}</p>}
        </div>}
        {!loading && !error && selected && <article className="space-y-4 text-sm">
          <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => setSelected(null)}>{english ? 'Back to records' : '返回清單'}</Button>
          <header><h3 className="font-semibold">{text(result.title) || selected.packId}</h3>
            <p>{english ? 'Saved at: ' : '儲存時間：'}{new Date(storedTimestampForDisplay(selected.savedAt)).toLocaleString(english ? 'en' : 'zh-TW')}</p>
            <p className="text-muted-foreground">{english ? 'Historical snapshot · clinician identity unverified' : '歷史快照・醫師身分尚未驗證'}</p></header>
          <p className="whitespace-pre-wrap break-words">{text(result.summary)}</p>
          {recommendations.map((item, index) => <SavedRecommendation key={index} value={item} english={english} />)}
          <details><summary className="min-h-[44px] cursor-pointer py-3 font-medium">{english ? 'Clinician inputs' : '人工輸入'}</summary><SavedFields value={selected.save.physician_inputs} /></details>
          <details><summary className="min-h-[44px] cursor-pointer py-3 font-medium">{english ? 'Clinician decisions' : '醫師決策'}</summary><SavedFields value={selected.save.physician_decisions} /></details>
        </article>}
        <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => { setOpen(false); controller.current?.abort() }}>{english ? 'Close' : '關閉'}</Button>
      </DialogContent>
    </Dialog>
  </div>
}

/** Shared controls travel together into the full-window header. */
export function CdssSaveControls({ english, signedIn, saving, status, saveDisabled, restoreDisabled, onSave, onRestore }: {
  english: boolean; signedIn: boolean; saving: boolean; status: string; saveDisabled: boolean; restoreDisabled: boolean;
  onSave: () => void; onRestore: () => void;
}) {
  return <div className="flex flex-wrap items-center gap-2">
    <Button type="button" variant="outline" className="min-h-[44px] whitespace-normal shadow-none" onClick={onSave}
      disabled={saveDisabled} aria-busy={saving} data-testid="cdss-save-record">
      {!signedIn ? english ? 'Sign in to save' : '請先登入後儲存' : saving ? english ? 'Saving…' : '儲存中…' : english ? 'Save CDSS record' : '儲存 CDSS 紀錄'}
    </Button>
    {signedIn && <>
      <span role="status" className="text-sm text-muted-foreground" data-testid="cdss-save-status">{status}</span>
      <Button type="button" variant="outline" className="min-h-[44px] whitespace-normal shadow-none" disabled={restoreDisabled}
        onClick={onRestore} data-testid="cdss-restore-record">{english ? 'Restore last saved state' : '還原最後儲存狀態'}</Button>
    </>}
  </div>
}
